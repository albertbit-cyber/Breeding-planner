import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { createNotification } from "./notificationService";
import { cleanGeneList, describeWishlist, listingMatchesWishlist } from "./wishlistMatching";

const db = prisma as any;

const MAX_WISHLISTS_PER_USER = 25;

const text = (value: unknown, max = 200): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
};

const priceOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

const toWishlistDto = (row: any) => ({
  id: row.id,
  label: row.label,
  species: row.species || "",
  includeGenes: row.includeGenes || [],
  excludeGenes: row.excludeGenes || [],
  sex: row.sex || "",
  maxPrice: row.maxPrice === null || row.maxPrice === undefined ? null : Number(row.maxPrice),
  country: row.country || "",
  isActive: row.isActive !== false,
  matchCount: row._count?.matches ?? row.matchCount ?? 0,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const wishlistInput = (payload: Record<string, unknown>) => {
  const includeGenes = cleanGeneList(payload.includeGenes);
  const excludeGenes = cleanGeneList(payload.excludeGenes);
  const species = text(payload.species, 120);
  const sex = text(payload.sex, 40);
  const country = text(payload.country, 120);
  const maxPrice = priceOrNull(payload.maxPrice);

  if (!includeGenes.length && !species && !sex && !country && maxPrice === null) {
    throw new HttpError(400, "Add at least one gene or filter, or the wishlist matches nothing.");
  }

  return {
    label: text(payload.label, 120) || includeGenes.join(" + ") || "Wishlist",
    species,
    includeGenes,
    excludeGenes,
    sex,
    maxPrice,
    country,
    isActive: payload.isActive === undefined ? true : payload.isActive !== false,
  };
};

export const listMyWishlists = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceWishlist.findMany({
    where: { userId: actor.id },
    include: { _count: { select: { matches: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return { wishlists: rows.map(toWishlistDto) };
};

export const createWishlist = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const count = await db.marketplaceWishlist.count({ where: { userId: actor.id } });
  if (count >= MAX_WISHLISTS_PER_USER) {
    throw new HttpError(400, `A wishlist can hold ${MAX_WISHLISTS_PER_USER} entries. Remove one to add another.`);
  }
  const row = await db.marketplaceWishlist.create({
    data: { userId: actor.id, ...wishlistInput(payload) },
    include: { _count: { select: { matches: true } } },
  });
  return { wishlist: toWishlistDto(row) };
};

export const updateWishlist = async (
  actor: AuthenticatedUser,
  id: string,
  payload: Record<string, unknown>
) => {
  const existing = await db.marketplaceWishlist.findUnique({ where: { id } });
  if (!existing || existing.userId !== actor.id) throw new HttpError(404, "Wishlist entry not found.");
  const row = await db.marketplaceWishlist.update({
    where: { id },
    data: wishlistInput({ ...existing, ...payload }),
    include: { _count: { select: { matches: true } } },
  });
  return { wishlist: toWishlistDto(row) };
};

export const deleteWishlist = async (actor: AuthenticatedUser, id: string) => {
  const existing = await db.marketplaceWishlist.findUnique({ where: { id } });
  if (!existing || existing.userId !== actor.id) throw new HttpError(404, "Wishlist entry not found.");
  await db.marketplaceWishlist.delete({ where: { id } });
  return { deleted: true };
};

/** What each of the buyer's entries has turned up, newest first. */
export const listMyWishlistMatches = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceWishlistMatch.findMany({
    where: { wishlist: { userId: actor.id } },
    include: {
      wishlist: { select: { id: true, label: true } },
      listing: {
        include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });

  return {
    matches: rows
      .filter((row: any) => row.listing && row.listing.archivedAt === null)
      .map((row: any) => ({
        id: row.id,
        createdAt: row.createdAt,
        wishlist: { id: row.wishlist?.id, label: row.wishlist?.label },
        listing: {
          id: row.listing.id,
          title: row.listing.title,
          genetics: row.listing.genetics || "",
          price: row.listing.price === null || row.listing.price === undefined ? null : Number(row.listing.price),
          currency: row.listing.currency,
          status: row.listing.status,
          sellerUserId: row.listing.sellerUserId,
          imageUrl: row.listing.images?.[0]?.imageUrl || "",
        },
      })),
  };
};

/**
 * Tells everyone who asked to hear about an animal like this one.
 *
 * Runs after a listing is published rather than inside the write: a wishlist
 * that cannot be notified must never be the reason a breeder's listing fails to
 * save. Every failure here is swallowed for the same reason.
 *
 * The unique pair on (wishlist, listing) is what keeps this quiet. A seller
 * editing a price re-publishes the listing, and without it every edit would
 * notify the same buyer about the same snake again.
 */
export const notifyWishlistMatches = async (listing: any): Promise<number> => {
  try {
    if (!listing?.id) return 0;
    if (listing.archivedAt) return 0;
    if (listing.status !== "available") return 0;

    const candidates = await db.marketplaceWishlist.findMany({
      where: { isActive: true, userId: { not: listing.sellerUserId } },
      take: 500,
    });
    if (!candidates.length) return 0;

    const facts = {
      species: listing.species,
      genetics: listing.genetics,
      sex: listing.sex,
      price: listing.price === null || listing.price === undefined ? null : Number(listing.price),
      country: listing.country,
    };

    let notified = 0;
    for (const wishlist of candidates) {
      if (!listingMatchesWishlist(facts, wishlist)) continue;

      // The unique index is the real guard; create-and-catch means two
      // simultaneous publishes cannot both slip past a prior existence check.
      try {
        await db.marketplaceWishlistMatch.create({
          data: { wishlistId: wishlist.id, listingId: listing.id },
        });
      } catch {
        continue;
      }

      const wanted = describeWishlist(wishlist);
      await createNotification({
        recipientId: wishlist.userId,
        actorId: listing.sellerUserId || null,
        type: "wishlist_match",
        title: "An animal on your wishlist is for sale",
        message: wanted
          ? `${listing.title} matches "${wishlist.label}" — ${wanted}.`
          : `${listing.title} matches "${wishlist.label}".`,
        metadata: {
          listingId: listing.id,
          wishlistId: wishlist.id,
          title: listing.title,
          genetics: listing.genetics || "",
          price: facts.price,
          currency: listing.currency || "EUR",
        },
      });
      notified += 1;
    }
    return notified;
  } catch (error) {
    console.error("[wishlist] could not notify matches for this listing:", error);
    return 0;
  }
};
