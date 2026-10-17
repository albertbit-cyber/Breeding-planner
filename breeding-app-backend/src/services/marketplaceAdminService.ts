import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { toMarketplaceListingDto, toMarketplaceStoreDto } from "./marketplaceDtos";
import { syncListingPhotosFromAnimal } from "./marketplaceListingPhotos";
import { assertAdminActor, assertStaffActor } from "./permissionHelpers";
import { listedWhere } from "./marketplaceVisibility";

/**
 * The admin's marketplace console: what is on the marketplace, in numbers and in a table, and the
 * moderation actions on it. The page used to be a copy of the public marketplace with a short list
 * bolted on; nothing on the server counted anything.
 *
 * Moderators read all of it; only admins change anything.
 */

const db = prisma as any;

const DAY = 24 * 60 * 60 * 1000;

const LISTING_INCLUDE = {
  images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  seller: {
    select: { id: true, fullName: true, email: true, verificationStatus: true, profile: true, marketplaceStores: true },
  },
  _count: { select: { reports: true, conversations: true } },
};

const assertStaff = (actor: AuthenticatedUser) => {
  try {
    assertStaffActor(actor);
  } catch {
    throw new HttpError(403, "Only staff can see the marketplace console.");
  }
};

const assertAdmin = (actor: AuthenticatedUser) => {
  try {
    assertAdminActor(actor);
  } catch {
    throw new HttpError(403, "Only admin users can moderate the marketplace.");
  }
};

const countBy = (rows: Array<{ _count: { _all: number } } & Record<string, any>>, field: string) =>
  Object.fromEntries(rows.map((row) => [String(row[field] ?? "unknown"), row._count?._all || 0]));

/** The dashboard's numbers. Every count is one query; nothing is loaded to be counted in memory. */
export const getMarketplaceStats = async (actor: AuthenticatedUser, now = new Date()) => {
  assertStaff(actor);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const live = { archivedAt: null };

  const [
    total,
    byStatus,
    listed,
    featured,
    newThisWeek,
    newThisMonth,
    withoutPhotos,
    sums,
    sellers,
    stores,
    verifiedStores,
    openReports,
    conversations,
    conversationsThisWeek,
    sales,
    bySpecies,
    topSellerRows,
  ] = await Promise.all([
    db.marketplaceListing.count({ where: live }),
    db.marketplaceListing.groupBy({ by: ["status"], where: live, _count: { _all: true } }),
    db.marketplaceListing.count({ where: listedWhere() }),
    db.marketplaceListing.count({ where: { ...live, isFeatured: true } }),
    db.marketplaceListing.count({ where: { ...live, createdAt: { gte: weekAgo } } }),
    db.marketplaceListing.count({ where: { ...live, createdAt: { gte: monthAgo } } }),
    db.marketplaceListing.count({ where: { ...listedWhere(), images: { none: {} } } }),
    db.marketplaceListing.aggregate({ where: live, _sum: { viewsCount: true, favoritesCount: true } }),
    db.marketplaceListing.groupBy({ by: ["sellerUserId"], where: live, _count: { _all: true } }),
    db.marketplaceStore.count(),
    db.marketplaceStore.count({ where: { isVerified: true } }),
    db.report.count({ where: { status: "open", relatedMarketplaceListingId: { not: null } } }),
    db.marketplaceConversation.count(),
    db.marketplaceConversation.count({ where: { createdAt: { gte: weekAgo } } }),
    db.marketplaceSale.groupBy({ by: ["saleStatus"], _count: { _all: true } }),
    db.marketplaceListing.groupBy({ by: ["species"], where: listedWhere(), _count: { _all: true } }),
    db.marketplaceListing.groupBy({
      by: ["sellerUserId"],
      where: listedWhere(),
      _count: { _all: true },
      orderBy: { _count: { sellerUserId: "desc" } },
      take: 5,
    }),
  ]);

  const sellerIds = topSellerRows.map((row: any) => row.sellerUserId);
  const sellerUsers = sellerIds.length
    ? await db.user.findMany({
        where: { id: { in: sellerIds } },
        select: { id: true, fullName: true, email: true, marketplaceStores: { select: { storeName: true } } },
      })
    : [];
  const sellerById = new Map(sellerUsers.map((user: any) => [user.id, user]));

  return {
    listings: {
      total,
      listed,
      featured,
      newThisWeek,
      newThisMonth,
      withoutPhotos,
      byStatus: countBy(byStatus, "status"),
    },
    engagement: {
      views: Number(sums?._sum?.viewsCount || 0),
      favorites: Number(sums?._sum?.favoritesCount || 0),
      conversations,
      conversationsThisWeek,
    },
    sellers: { withListings: sellers.length, stores, verifiedStores },
    sales: countBy(sales, "saleStatus"),
    openReports,
    bySpecies: bySpecies
      .map((row: any) => ({ species: row.species || "Unknown", count: row._count?._all || 0 }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 8),
    topSellers: topSellerRows.map((row: any) => {
      const user: any = sellerById.get(row.sellerUserId);
      const store = Array.isArray(user?.marketplaceStores) ? user.marketplaceStores[0] : user?.marketplaceStores;
      return {
        userId: row.sellerUserId,
        name: store?.storeName || user?.fullName || user?.email || row.sellerUserId,
        listed: row._count?._all || 0,
      };
    }),
    generatedAt: now.toISOString(),
  };
};

const SORTS: Record<string, any> = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  updated: { updatedAt: "desc" },
  views: { viewsCount: "desc" },
  favorites: { favoritesCount: "desc" },
  price_high: { price: "desc" },
  price_low: { price: "asc" },
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
};

/** The ads table: filter, search, sort, page. Archived listings only when asked for. */
export const listAdminListings = async (actor: AuthenticatedUser, query: Record<string, unknown> = {}) => {
  assertStaff(actor);
  const status = String(query.status || "").trim();
  const search = String(query.q || "").trim().slice(0, 120);
  const page = clampInt(query.page, 1, 1, 10000);
  const pageSize = clampInt(query.pageSize, 25, 5, 100);

  const where: Record<string, any> = {};
  if (status === "archived") where.archivedAt = { not: null };
  else {
    where.archivedAt = null;
    if (status === "featured") where.isFeatured = true;
    else if (status === "no_photos") where.images = { none: {} };
    else if (status === "reported") where.reports = { some: { status: "open" } };
    else if (status) where.status = status;
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { genetics: { contains: search, mode: "insensitive" } },
      { animalId: { contains: search, mode: "insensitive" } },
      { seller: { fullName: { contains: search, mode: "insensitive" } } },
      { seller: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.marketplaceListing.findMany({
      where,
      include: LISTING_INCLUDE,
      orderBy: SORTS[String(query.sort || "newest")] || SORTS.newest,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.marketplaceListing.count({ where }),
  ]);

  return {
    listings: rows
      .map((row: any) => {
        const dto: any = toMarketplaceListingDto(row);
        if (!dto) return null;
        return {
          ...dto,
          animalId: row.animalId || null,
          archivedAt: row.archivedAt || null,
          sellerEmail: row.seller?.email || "",
          photoCount: (row.images || []).length,
          openReports: row._count?.reports || 0,
          conversations: row._count?.conversations || 0,
        };
      })
      .filter(Boolean),
    total,
    page,
    pageSize,
  };
};

const MODERATION_STATUSES = ["available", "reserved", "sold", "hidden", "draft", "archived"];

/**
 * One moderation change: status (approve = available, hide, archive, restore) and/or the featured
 * flag. "Feature" used to write status "featured", which is not a status, so the card dropped out
 * of browse instead of being promoted.
 */
export const moderateListing = async (actor: AuthenticatedUser, id: string, payload: Record<string, unknown>) => {
  assertAdmin(actor);
  const existing = await db.marketplaceListing.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Marketplace listing not found.");

  const data: Record<string, unknown> = {};
  if (payload.status !== undefined) {
    const status = String(payload.status || "").trim();
    if (!MODERATION_STATUSES.includes(status)) throw new HttpError(400, `Unknown status "${status}".`);
    if (status === "archived") {
      data.archivedAt = existing.archivedAt || new Date();
    } else {
      data.status = status;
      data.archivedAt = null;
      if (["available", "reserved"].includes(status)) {
        data.availability = status;
        if (!existing.publishedAt) data.publishedAt = new Date();
      }
    }
  }
  if (payload.isFeatured !== undefined) data.isFeatured = Boolean(payload.isFeatured);
  if (!Object.keys(data).length) throw new HttpError(400, "Nothing to change.");

  const updated = await db.marketplaceListing.update({ where: { id }, data, include: LISTING_INCLUDE });
  await db.adminAuditLog
    .create({
      data: {
        adminUserId: actor.id,
        targetUserId: existing.sellerUserId,
        action: "marketplace_listing_moderated",
        beforeJson: { id, status: existing.status, isFeatured: existing.isFeatured, archivedAt: existing.archivedAt },
        afterJson: { id, ...data },
        reason: String(payload.reason || "marketplace_moderation").slice(0, 500),
      },
    })
    .catch(() => null);
  return { listing: toMarketplaceListingDto(updated) };
};

/**
 * Re-takes listing photos from their animals: one listing, or every unarchived listing tied to an
 * animal (the backfill for cards published before this existed, most of which show no photo).
 */
export const refreshListingPhotos = async (actor: AuthenticatedUser, payload: Record<string, unknown> = {}) => {
  assertAdmin(actor);
  const listingId = String(payload.listingId || "").trim();
  const listings = await db.marketplaceListing.findMany({
    where: listingId ? { id: listingId } : { archivedAt: null, animalId: { not: null } },
    select: { id: true, sellerUserId: true, animalId: true },
    take: listingId ? 1 : 2000,
  });
  if (listingId && !listings.length) throw new HttpError(404, "Marketplace listing not found.");

  const summary = { checked: 0, updated: 0, withPhotos: 0, skipped: {} as Record<string, number> };
  for (const listing of listings) {
    summary.checked += 1;
    try {
      const result = await syncListingPhotosFromAnimal(listing);
      if (result.changed) summary.updated += 1;
      if (result.photos) summary.withPhotos += 1;
      if (result.skipped) summary.skipped[result.skipped] = (summary.skipped[result.skipped] || 0) + 1;
    } catch (error) {
      summary.skipped.error = (summary.skipped.error || 0) + 1;
      console.warn(`[marketplace] photo refresh failed for ${listing.id}:`, (error as Error)?.message || error);
    }
  }
  return summary;
};

/** The stores list, with how many listings each has live. */
export const listAdminStores = async (actor: AuthenticatedUser) => {
  assertStaff(actor);
  const stores = await db.marketplaceStore.findMany({
    include: { user: { select: { id: true, fullName: true, email: true, verificationStatus: true } } },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const counts = stores.length
    ? await db.marketplaceListing.groupBy({
        by: ["sellerUserId"],
        where: { ...listedWhere(), sellerUserId: { in: stores.map((store: any) => store.userId) } },
        _count: { _all: true },
      })
    : [];
  const listedBySeller = new Map(counts.map((row: any) => [row.sellerUserId, row._count?._all || 0]));
  return {
    stores: stores.map((store: any) => ({
      ...toMarketplaceStoreDto(store),
      userId: store.userId,
      email: store.user?.email || "",
      listed: listedBySeller.get(store.userId) || 0,
      createdAt: store.createdAt,
    })),
  };
};
