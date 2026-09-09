import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { canAccessFeature } from "./subscriptionService";
import { createNotification } from "./notificationService";
import {
  toMarketplaceConversationDto,
  toMarketplaceListingDto,
  toMarketplaceMessageDto,
  toMarketplaceReviewDto,
  toMarketplaceStoreDto,
} from "./marketplaceDtos";
import { buildListingRecord, buildListingRecords, findUnpublishedEvidence } from "./marketplaceRecordService";
import { assertAdminActor, assertOwnerOrAdmin, assertSellerActor } from "./permissionHelpers";

const db = prisma as any;

const LISTING_INCLUDE = {
  images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  seller: {
    select: {
      id: true,
      fullName: true,
      email: true,
      verificationStatus: true,
      profile: true,
      marketplaceStores: true,
    },
  },
};

const STORE_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true, verificationStatus: true } },
};

const text = (value: unknown, max = 1000): string | null => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : null;
};

const bool = (value: unknown): boolean => value === true || String(value || "").toLowerCase() === "true";

const numberOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dateOrNull = (value: unknown): Date | null => {
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const yearFromDate = (value: unknown): number | null => {
  const date = dateOrNull(value);
  if (date) return date.getUTCFullYear();
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 1900 ? Math.floor(parsed) : null;
};

const assertSeller = async (actor: AuthenticatedUser) => {
  try {
    assertSellerActor(actor);
  } catch {
    throw new HttpError(403, "Only breeder or admin users can manage marketplace listings.");
  }
};

const assertAdmin = (actor: AuthenticatedUser) => {
  try {
    assertAdminActor(actor);
  } catch {
    throw new HttpError(403, "Only admin users can manage marketplace moderation.");
  }
};

const listingData = (payload: Record<string, unknown>) => ({
  animalId: text(payload.animalId || payload.animalAppId, 160),
  title: text(payload.title || payload.name, 180) || "Marketplace animal",
  species: text(payload.species, 120) || "Ball python",
  category: text(payload.category, 120),
  genetics: text(payload.genetics || payload.morph, 2000),
  sex: text(payload.sex, 40),
  birthDate: dateOrNull(payload.birthDate || payload.hatchDate || payload.dateOfBirth),
  year: yearFromDate(payload.year || payload.birthDate || payload.hatchDate),
  weight: numberOrNull(payload.weight),
  price: numberOrNull(payload.price),
  currency: text(payload.currency, 12) || "EUR",
  status: text(payload.status, 40) || "draft",
  availability: text(payload.availability, 40) || text(payload.status, 40) || "available",
  country: text(payload.country, 120),
  city: text(payload.city || payload.region, 120),
  shippingAvailable: bool(payload.shippingAvailable),
  pickupAvailable: bool(payload.pickupAvailable),
  description: text(payload.description, 5000),
  feedingNotes: text(payload.feedingNotes, 2000),
  temperamentNotes: text(payload.temperamentNotes, 2000),
  publicDataSettingsJson: payload.publicDataSettings && typeof payload.publicDataSettings === "object"
    ? payload.publicDataSettings
    : {
        showAnimalId: bool(payload.showAnimalId),
        showParents: bool(payload.showParents),
        showFeedingHistory: bool(payload.showFeedingHistory),
        showWeightHistory: bool(payload.showWeightHistory),
        showGeneticTestResult: bool(payload.showGeneticTestResult),
        showDocuments: bool(payload.showDocuments),
        showBreederNotes: bool(payload.showBreederNotes),
        showLineage: bool(payload.showLineage),
      },
});

const imageInputs = (payload: Record<string, unknown>): Array<{ imageUrl: string; isPrimary: boolean; sortOrder: number }> => {
  const images = Array.isArray(payload.images) ? payload.images : [];
  const normalized = images.map((item, index) => {
    const record: Record<string, unknown> = item && typeof item === "object" ? item as Record<string, unknown> : { imageUrl: item };
    return {
      imageUrl: text(record.imageUrl || record.url || record.src, 2000) || "",
      isPrimary: bool(record.isPrimary) || index === 0,
      sortOrder: Number(record.sortOrder || index),
    };
  }).filter((item) => item.imageUrl);
  const single = text(payload.imageUrl || payload.photoUrl, 2000);
  if (single && !normalized.some((item) => item.imageUrl === single)) normalized.unshift({ imageUrl: single, isPrimary: true, sortOrder: 0 });
  return normalized;
};

const geneList = (value: unknown): string[] =>
  String(value ?? "")
    .split(",")
    .map((gene) => gene.trim())
    .filter(Boolean)
    .slice(0, 12);

/**
 * Browse.
 *
 * Every filter runs in the query. They used to be split -- sex and price on the
 * server, genes and weight and verified-only in the browser -- over a page
 * capped at 200 rows, so a rare morph could be genuinely listed and genuinely
 * invisible, and the result count was the size of the truncated page rather
 * than the size of the match.
 */
export const listMarketplaceListings = async (
  query: Record<string, unknown>,
  viewer?: AuthenticatedUser | null
) => {
  const search = text(query.search, 160);
  const includeSold = bool(query.includeSold);
  const availability = text(query.availability, 40);

  const where: any = { archivedAt: null, AND: [] as any[] };

  // Sold animals are price comparison, not stock. They are opt-in.
  if (availability) {
    where.availability = availability;
    where.status = { in: ["available", "reserved", "sold"] };
  } else {
    where.status = { in: includeSold ? ["available", "reserved", "sold"] : ["available", "reserved"] };
    if (!includeSold) where.availability = { in: ["available", "reserved", "featured"] };
  }

  const species = text(query.species, 120);
  if (species && species.toLowerCase() !== "any") where.species = { equals: species, mode: "insensitive" };

  if (text(query.sex, 40)) where.sex = text(query.sex, 40);
  if (text(query.category, 120)) where.category = { equals: text(query.category, 120), mode: "insensitive" };
  if (text(query.country, 120)) where.country = { contains: text(query.country, 120), mode: "insensitive" };
  if (query.shippingAvailable !== undefined && query.shippingAvailable !== "") where.shippingAvailable = bool(query.shippingAvailable);
  if (query.pickupAvailable !== undefined && query.pickupAvailable !== "") where.pickupAvailable = bool(query.pickupAvailable);

  const minPrice = numberOrNull(query.minPrice);
  const maxPrice = numberOrNull(query.maxPrice);
  if (minPrice !== null || maxPrice !== null) where.price = {};
  if (minPrice !== null) where.price.gte = minPrice;
  if (maxPrice !== null) where.price.lte = maxPrice;

  const minWeight = numberOrNull(query.minWeight);
  const maxWeight = numberOrNull(query.maxWeight);
  if (minWeight !== null || maxWeight !== null) where.weight = {};
  if (minWeight !== null) where.weight.gte = minWeight;
  if (maxWeight !== null) where.weight.lte = maxWeight;

  // Gene tokens. Include is AND (every gene must be present), exclude is NOT.
  geneList(query.includeGenes).forEach((gene) => {
    where.AND.push({ genetics: { contains: gene, mode: "insensitive" } });
  });
  geneList(query.excludeGenes).forEach((gene) => {
    where.AND.push({ NOT: { genetics: { contains: gene, mode: "insensitive" } } });
  });

  if (bool(query.verifiedOnly)) {
    where.AND.push({
      OR: [
        { seller: { marketplaceStores: { some: { isVerified: true } } } },
        { seller: { verificationStatus: "approved" } },
      ],
    });
  }

  if (search) {
    where.AND.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { genetics: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
        { country: { contains: search, mode: "insensitive" } },
        { seller: { marketplaceStores: { some: { storeName: { contains: search, mode: "insensitive" } } } } },
      ],
    });
  }

  if (!where.AND.length) delete where.AND;

  const sort = text(query.sort, 80) || "best";
  const orderBy =
    sort === "price_low"
      ? [{ price: "asc" }]
      : sort === "price_high"
        ? [{ price: "desc" }]
        : sort === "newest"
          ? [{ publishedAt: "desc" }, { createdAt: "desc" }]
          : sort === "updated"
            ? [{ updatedAt: "desc" }]
            : [{ isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }];

  const pageSize = Math.min(48, Math.max(1, Number(numberOrNull(query.pageSize) ?? 24)));
  const page = Math.max(1, Number(numberOrNull(query.page) ?? 1));

  const [total, rows] = await Promise.all([
    db.marketplaceListing.count({ where }),
    db.marketplaceListing.findMany({
      where,
      include: LISTING_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  /**
   * The record layer decorates the catalogue; it must never be able to empty
   * it. A missing lab module already turned every browse into a 500 once, so a
   * failure here degrades to cards without provenance rather than no cards.
   */
  let records = new Map<string, any>();
  try {
    records = await buildListingRecords(rows);
  } catch (error) {
    console.error("[marketplace] provenance unavailable for this page:", error);
  }

  // Which of these the viewer has already saved. One query for the page, and
  // nothing at all for a signed-out visitor.
  const favorited = new Set<string>();
  if (viewer?.id && rows.length) {
    const marks = await db.marketplaceFavorite.findMany({
      where: { userId: viewer.id, listingId: { in: rows.map((row: any) => row.id) } },
      select: { listingId: true },
    });
    marks.forEach((mark: any) => favorited.add(mark.listingId));
  }

  // The one filter that cannot live in SQL: provenance is computed from the
  // animal record and the seller's publish switches. Applied after the page is
  // built, and reported honestly rather than folded into `total`.
  const minProvenance = Number(numberOrNull(query.minProvenance) ?? 0);
  const filtered = minProvenance > 0
    ? rows.filter((row: any) => (records.get(row.id)?.provenance.filled || 0) >= minProvenance)
    : rows;

  return {
    listings: filtered
      .map((row: any) => {
        const dto = toMarketplaceListingDto(row, records.get(row.id));
        return dto ? { ...dto, isFavorited: favorited.has(row.id) } : dto;
      })
      .filter(Boolean),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
    provenanceFiltered: minProvenance > 0 ? rows.length - filtered.length : 0,
  };
};

/**
 * Sold comparables. The listing grid used to pad itself with sold animals;
 * the same rows are worth much more as an answer to "is this price sane".
 */
export const getMarketplaceComparables = async (listingId: string) => {
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new HttpError(404, "Marketplace listing not found.");

  const genes = String(listing.genetics || "")
    .split(/[,/]/)
    .map((gene: string) => gene.trim())
    .filter(Boolean)
    .slice(0, 3);

  const since = new Date(Date.now() - 365 * 86400000);
  const where: any = {
    id: { not: listingId },
    availability: "sold",
    price: { not: null },
    updatedAt: { gte: since },
    species: listing.species || undefined,
  };
  if (genes.length) {
    where.AND = genes.map((gene: string) => ({ genetics: { contains: gene, mode: "insensitive" } }));
  }

  let rows = await db.marketplaceListing.findMany({
    where,
    select: { price: true, currency: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });

  // Fall back to the leading gene alone rather than reporting nothing.
  if (rows.length < 3 && genes.length > 1) {
    rows = await db.marketplaceListing.findMany({
      where: {
        id: { not: listingId },
        availability: "sold",
        price: { not: null },
        updatedAt: { gte: since },
        genetics: { contains: genes[0], mode: "insensitive" },
      },
      select: { price: true, currency: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    });
  }

  const prices = rows
    .map((row: any) => Number(row.price))
    .filter((price: number) => Number.isFinite(price) && price > 0)
    .sort((a: number, b: number) => a - b);

  if (prices.length < 3) {
    return { comparables: { count: prices.length, low: null, high: null, median: null, currency: listing.currency, genes } };
  }

  const at = (fraction: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * fraction))];
  return {
    comparables: {
      count: prices.length,
      low: at(0.1),
      high: at(0.9),
      median: at(0.5),
      currency: listing.currency,
      genes,
    },
  };
};

export const getMarketplaceListing = async (id: string, viewer?: AuthenticatedUser | null) => {
  const listing = await db.marketplaceListing.update({
    where: { id },
    data: { viewsCount: { increment: 1 } },
    include: LISTING_INCLUDE,
  }).catch(async () => db.marketplaceListing.findUnique({ where: { id }, include: LISTING_INCLUDE }));
  if (!listing) throw new HttpError(404, "Marketplace listing not found.");
  const record = await buildListingRecord(listing);
  const dto = toMarketplaceListingDto(listing, record);
  if (dto && viewer?.id) {
    const mark = await db.marketplaceFavorite.findUnique({
      where: { userId_listingId: { userId: viewer.id, listingId: id } },
    });
    (dto as any).isFavorited = Boolean(mark);
  }
  return { listing: dto };
};

export const listSellerDashboard = async (actor: AuthenticatedUser) => {
  await assertSeller(actor);
  const [listings, store, conversations, sales] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerUserId: actor.id }, include: LISTING_INCLUDE, orderBy: { updatedAt: "desc" } }),
    db.marketplaceStore.findUnique({ where: { userId: actor.id }, include: STORE_INCLUDE }),
    db.marketplaceConversation.findMany({
      where: { sellerUserId: actor.id },
      include: {
        listing: { include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } },
        messages: { orderBy: { createdAt: "asc" } },
        buyer: { select: { id: true, fullName: true } },
        seller: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.marketplaceSale.findMany({ where: { sellerUserId: actor.id }, include: { listing: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);

  const records = await buildListingRecords(listings);
  const threads = conversations.map((row: any) => toMarketplaceConversationDto(row, actor.id)).filter(Boolean);

  /**
   * A seller's first question is never "what is my conversion rate", it is
   * "what is waiting on me". Anything unanswered, every open offer, and any
   * deposit running out of time -- oldest first.
   */
  const now = Date.now();
  const needsYou: any[] = [];

  threads.forEach((thread: any) => {
    if (!thread.lastMessage || thread.lastMessage.mine) return;
    const offer = thread.latestOffer && !thread.latestOffer.mine ? thread.latestOffer : null;
    needsYou.push({
      kind: offer ? "offer" : "message",
      conversationId: thread.id,
      listingId: thread.listingId,
      listingTitle: thread.listing?.title || "",
      counterpartyName: thread.counterparty?.name || "A buyer",
      offerAmount: offer ? offer.offerAmount : null,
      askingPrice: thread.listing?.price ?? null,
      currency: thread.listing?.currency || "EUR",
      waitingSince: thread.lastMessage.createdAt,
    });
  });

  sales.forEach((sale: any) => {
    if (sale.saleStatus !== "reserved" || !sale.createdAt) return;
    const expiresAt = new Date(new Date(sale.createdAt).getTime() + 30 * 86400000);
    const daysLeft = Math.ceil((expiresAt.getTime() - now) / 86400000);
    if (daysLeft > 7) return;
    needsYou.push({
      kind: "deposit",
      saleId: sale.id,
      listingId: sale.listingId,
      listingTitle: sale.listing?.title || "",
      counterpartyName: sale.buyerName || "the buyer",
      daysLeft,
      currency: sale.currency,
      depositAmount: sale.depositAmount === null || sale.depositAmount === undefined ? null : Number(sale.depositAmount),
      waitingSince: sale.createdAt,
    });
  });

  needsYou.sort((a, b) => new Date(a.waitingSince || 0).getTime() - new Date(b.waitingSince || 0).getTime());

  /**
   * Evidence the seller holds but has not published -- the strongest single
   * lever on a slow listing, and the system can already see it.
   */
  const slow = listings
    .filter((item: any) => item.status === "available" && item.animalId)
    .sort((a: any, b: any) => Number(a.favoritesCount || 0) - Number(b.favoritesCount || 0))
    .slice(0, 6);
  const suggestions = (
    await Promise.all(
      slow.map(async (listing: any) => {
        const missing = await findUnpublishedEvidence(listing);
        if (!missing.length) return null;
        return { listingId: listing.id, listingTitle: listing.title, missing, viewsCount: listing.viewsCount || 0 };
      })
    )
  ).filter(Boolean);

  const sold = sales.filter((sale: any) => sale.saleStatus === "completed" || sale.saleStatus === "sold");
  const daysToSell = listings
    .filter((item: any) => item.availability === "sold" && item.publishedAt)
    .map((item: any) => Math.max(0, Math.round((new Date(item.updatedAt).getTime() - new Date(item.publishedAt).getTime()) / 86400000)))
    .sort((a: number, b: number) => a - b);

  return {
    store: store ? toMarketplaceStoreDto(store) : null,
    listings: listings.map((listing: any) => toMarketplaceListingDto(listing, records.get(listing.id))).filter(Boolean),
    conversations: threads,
    needsYou,
    suggestions,
    sales,
    analytics: {
      activeListings: listings.filter((item: any) => item.status === "available").length,
      draftListings: listings.filter((item: any) => item.status === "draft").length,
      reservedListings: listings.filter((item: any) => item.availability === "reserved").length,
      soldListings: listings.filter((item: any) => item.availability === "sold").length,
      favoritesCount: listings.reduce((sum: number, item: any) => sum + Number(item.favoritesCount || 0), 0),
      viewsCount: listings.reduce((sum: number, item: any) => sum + Number(item.viewsCount || 0), 0),
      openConversations: threads.filter((thread: any) => thread.status === "open").length,
      salesRevenue: sold.reduce((sum: number, sale: any) => sum + Number(sale.salePrice || 0), 0),
      medianDaysToSell: daysToSell.length ? daysToSell[Math.floor(daysToSell.length / 2)] : null,
    },
  };
};

export const upsertMarketplaceStore = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  await assertSeller(actor);
  const data = {
    storeName: text(payload.storeName || payload.breederName, 160) || "Breeder Store",
    logoUrl: text(payload.logoUrl, 2000),
    bannerUrl: text(payload.bannerUrl, 2000),
    about: text(payload.about, 5000),
    country: text(payload.country, 120),
    city: text(payload.city, 120),
    websiteUrl: text(payload.websiteUrl, 2000),
    socialLinksJson: payload.socialLinks && typeof payload.socialLinks === "object" ? payload.socialLinks : null,
    terms: text(payload.terms, 5000),
    shippingPolicy: text(payload.shippingPolicy, 5000),
    paymentPolicy: text(payload.paymentPolicy, 5000),
  };
  const store = await db.marketplaceStore.upsert({
    where: { userId: actor.id },
    create: { userId: actor.id, ...data },
    update: data,
    include: STORE_INCLUDE,
  });
  return { store: toMarketplaceStoreDto(store) };
};

export const getMarketplaceStore = async (userId: string) => {
  const store = await db.marketplaceStore.findUnique({ where: { userId }, include: STORE_INCLUDE });
  if (!store) throw new HttpError(404, "Marketplace store not found.");
  const [listings, reviews] = await Promise.all([
    db.marketplaceListing.findMany({
      where: { sellerUserId: userId, archivedAt: null, status: { not: "draft" } },
      include: LISTING_INCLUDE,
      orderBy: { updatedAt: "desc" },
    }),
    db.marketplaceReview.findMany({
      where: { sellerUserId: userId },
      include: { reviewer: { select: { fullName: true } }, sale: { select: { listing: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const records = await buildListingRecords(listings);
  return { store: toMarketplaceStoreDto(store, listings, reviews, records) };
};

export const createMarketplaceListing = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  await assertSeller(actor);
  const access = await canAccessFeature(actor, "marketplace.create_listing");
  if (!access.allowed) throw new HttpError(403, access.reason || "Your tier does not include marketplace listings.");
  const data = listingData(payload);
  const images = imageInputs(payload);
  const listing = await db.$transaction(async (tx: any) => {
    const row = await tx.marketplaceListing.create({
      data: {
        sellerUserId: actor.id,
        ...data,
        publishedAt: data.status === "available" ? new Date() : null,
        images: { create: images },
      },
    });
    return tx.marketplaceListing.findUnique({ where: { id: row.id }, include: LISTING_INCLUDE });
  });
  return { listing: toMarketplaceListingDto(listing) };
};

export const updateMarketplaceListing = async (actor: AuthenticatedUser, id: string, payload: Record<string, unknown>) => {
  const existing = await db.marketplaceListing.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Marketplace listing not found.");
  assertOwnerOrAdmin(actor, existing.sellerUserId, "You cannot edit this listing.");
  const data = listingData(payload);
  const images = imageInputs(payload);
  const listing = await db.$transaction(async (tx: any) => {
    await tx.marketplaceListing.update({
      where: { id },
      data: { ...data, publishedAt: data.status === "available" && !existing.publishedAt ? new Date() : existing.publishedAt },
    });
    if (images.length) {
      await tx.marketplaceListingImage.deleteMany({ where: { listingId: id } });
      await tx.marketplaceListingImage.createMany({ data: images.map((image) => ({ ...image, listingId: id })) });
    }
    return tx.marketplaceListing.findUnique({ where: { id }, include: LISTING_INCLUDE });
  });
  return { listing: toMarketplaceListingDto(listing) };
};

export const updateMarketplaceListingStatus = async (actor: AuthenticatedUser, id: string, payload: Record<string, unknown>) => {
  const status = text(payload.status, 40) || "available";
  const availability = text(payload.availability, 40) || status;
  const existing = await db.marketplaceListing.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Marketplace listing not found.");
  assertOwnerOrAdmin(actor, existing.sellerUserId, "You cannot update this listing.");
  const listing = await db.marketplaceListing.update({
    where: { id },
    data: {
      status,
      availability,
      archivedAt: status === "archived" ? new Date() : existing.archivedAt,
      publishedAt: status === "available" && !existing.publishedAt ? new Date() : existing.publishedAt,
    },
    include: LISTING_INCLUDE,
  });
  return { listing: toMarketplaceListingDto(listing) };
};

export const toggleMarketplaceFavorite = async (actor: AuthenticatedUser, listingId: string) => {
  const access = await canAccessFeature(actor, "marketplace.favorite");
  if (!access.allowed) throw new HttpError(403, access.reason || "Your tier does not include favorites.");
  const existing = await db.marketplaceFavorite.findUnique({ where: { userId_listingId: { userId: actor.id, listingId } } });
  if (existing) {
    await db.marketplaceFavorite.delete({ where: { id: existing.id } });
    await db.marketplaceListing.update({ where: { id: listingId }, data: { favoritesCount: { decrement: 1 } } }).catch(() => null);
    return { favorited: false };
  }
  await db.marketplaceFavorite.create({ data: { userId: actor.id, listingId } });
  await db.marketplaceListing.update({ where: { id: listingId }, data: { favoritesCount: { increment: 1 } } });
  return { favorited: true };
};

export const createMarketplaceConversation = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const access = await canAccessFeature(actor, "marketplace.contact_seller");
  if (!access.allowed) throw new HttpError(403, access.reason || "Your tier does not include seller contact.");
  const listingId = text(payload.listingId, 160);
  const messageText = text(payload.messageText || payload.message, 5000);
  if (!listingId || !messageText) throw new HttpError(400, "listingId and messageText are required.");
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new HttpError(404, "Listing not found.");
  if (listing.sellerUserId === actor.id) throw new HttpError(400, "You cannot contact yourself about your own listing.");
  const existing = await db.marketplaceConversation.findFirst({
    where: { listingId, buyerUserId: actor.id },
  });
  if (existing) {
    // A second question about the same animal belongs in the same thread, not
    // in a new one the seller has to reconcile by hand.
    await addMarketplaceMessage(actor, existing.id, { messageText, offerAmount: payload.offerAmount });
    return getMarketplaceConversation(actor, existing.id);
  }

  const now = new Date();
  const conversation = await db.marketplaceConversation.create({
    data: {
      listingId,
      buyerUserId: actor.id,
      sellerUserId: listing.sellerUserId,
      status: "open",
      lastMessageAt: now,
      messages: { create: { senderUserId: actor.id, messageText, offerAmount: numberOrNull(payload.offerAmount) } },
    },
    include: { listing: true, messages: true },
  });
  await createNotification({
    recipientId: listing.sellerUserId,
    actorId: actor.id,
    type: "marketplace_message",
    title: "New marketplace message",
    message: `A buyer asked about ${listing.title}.`,
    metadata: { conversationId: conversation.id, listingId },
  });
  return getMarketplaceConversation(actor, conversation.id);
};

const CONVERSATION_INCLUDE = {
  listing: { include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 } } },
  messages: { orderBy: { createdAt: "asc" } },
  buyer: { select: { id: true, fullName: true } },
  seller: { select: { id: true, fullName: true } },
};

/**
 * The deal state a thread renders in its rail. One sale row per conversation
 * -- the newest, since a reservation that lapsed can be followed by another.
 */
const attachSale = async (conversations: any[]) => {
  if (!conversations.length) return conversations;
  const listingIds = Array.from(new Set(conversations.map((row: any) => row.listingId)));
  const sales = await db.marketplaceSale.findMany({
    where: { listingId: { in: listingIds } },
    orderBy: { createdAt: "desc" },
  });
  const byListing = new Map<string, any>();
  sales.forEach((sale: any) => {
    if (!byListing.has(sale.listingId)) byListing.set(sale.listingId, sale);
  });
  return conversations.map((row: any) => ({ ...row, sale: byListing.get(row.listingId) || null }));
};

export const listMarketplaceConversations = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceConversation.findMany({
    where: { OR: [{ buyerUserId: actor.id }, { sellerUserId: actor.id }] },
    include: CONVERSATION_INCLUDE,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  const withSale = await attachSale(rows);
  return { conversations: withSale.map((row: any) => toMarketplaceConversationDto(row, actor.id)).filter(Boolean) };
};

export const getMarketplaceConversation = async (actor: AuthenticatedUser, conversationId: string) => {
  const row = await db.marketplaceConversation.findUnique({ where: { id: conversationId }, include: CONVERSATION_INCLUDE });
  if (!row) throw new HttpError(404, "Conversation not found.");
  if (actor.role !== "admin" && row.buyerUserId !== actor.id && row.sellerUserId !== actor.id) {
    throw new HttpError(403, "You cannot access this conversation.");
  }
  const [withSale] = await attachSale([row]);
  return { conversation: toMarketplaceConversationDto(withSale, actor.id) };
};

/** Marks everything the other party sent as read. Drives the inbox badge. */
export const markMarketplaceConversationRead = async (actor: AuthenticatedUser, conversationId: string) => {
  const conversation = await db.marketplaceConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new HttpError(404, "Conversation not found.");
  if (actor.role !== "admin" && conversation.buyerUserId !== actor.id && conversation.sellerUserId !== actor.id) {
    throw new HttpError(403, "You cannot access this conversation.");
  }
  const result = await db.marketplaceMessage.updateMany({
    where: { conversationId, senderUserId: { not: actor.id }, readAt: null },
    data: { readAt: new Date() },
  });
  return { read: result.count || 0 };
};

/**
 * Accepting an offer is the one action that changes three things at once: the
 * sale record is written, the listing goes to Reserved, and the buyer is told.
 * Doing it in one endpoint is what stops "is this animal actually mine?" from
 * having two different answers.
 */
export const acceptMarketplaceOffer = async (
  actor: AuthenticatedUser,
  conversationId: string,
  payload: Record<string, unknown>
) => {
  const conversation = await db.marketplaceConversation.findUnique({
    where: { id: conversationId },
    include: { listing: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) throw new HttpError(404, "Conversation not found.");
  if (actor.role !== "admin" && conversation.sellerUserId !== actor.id) {
    throw new HttpError(403, "Only the seller can accept an offer.");
  }

  const offers = (conversation.messages || []).filter(
    (message: any) => message.offerAmount !== null && message.senderUserId !== conversation.sellerUserId
  );
  const requestedId = text(payload.messageId, 160);
  const offer = requestedId
    ? offers.find((message: any) => message.id === requestedId)
    : offers[offers.length - 1];
  if (!offer) throw new HttpError(400, "There is no buyer offer on this conversation to accept.");

  const amount = Number(offer.offerAmount);
  const depositAmount = numberOrNull(payload.depositAmount);

  const sale = await db.$transaction(async (tx: any) => {
    const created = await tx.marketplaceSale.create({
      data: {
        listingId: conversation.listingId,
        sellerUserId: conversation.sellerUserId,
        buyerUserId: conversation.buyerUserId,
        salePrice: amount,
        currency: conversation.listing?.currency || "EUR",
        depositAmount,
        paymentStatus: depositAmount ? "deposit_paid" : "pending",
        saleStatus: "reserved",
        handoverMethod: text(payload.handoverMethod, 160),
        handoverDate: dateOrNull(payload.handoverDate),
        notes: text(payload.notes, 5000),
      },
    });
    await tx.marketplaceListing.update({
      where: { id: conversation.listingId },
      data: { availability: "reserved", status: "reserved" },
    });
    await tx.marketplaceMessage.create({
      data: {
        conversationId,
        senderUserId: actor.id,
        messageText: `Offer accepted at ${conversation.listing?.currency || "EUR"} ${amount}. The animal is now reserved.`,
        offerAmount: amount,
      },
    });
    await tx.marketplaceConversation.update({
      where: { id: conversationId },
      data: { status: "reserved", lastMessageAt: new Date() },
    });
    return created;
  });

  if (conversation.buyerUserId) {
    await createNotification({
      recipientId: conversation.buyerUserId,
      actorId: actor.id,
      type: "marketplace_offer_accepted",
      title: "Your offer was accepted",
      message: `${conversation.listing?.title || "The animal"} is reserved for you.`,
      metadata: { conversationId, listingId: conversation.listingId, saleId: sale.id },
    });
  }

  return { sale, conversationId };
};

/** Public reviews for a store, and the aggregate the header shows. */
export const listMarketplaceReviews = async (sellerUserId: string) => {
  const [rows, aggregate] = await Promise.all([
    db.marketplaceReview.findMany({
      where: { sellerUserId },
      include: { reviewer: { select: { fullName: true } }, sale: { select: { listing: { select: { title: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.marketplaceReview.aggregate({ where: { sellerUserId }, _avg: { rating: true }, _count: { id: true } }),
  ]);
  return {
    reviews: rows.map(toMarketplaceReviewDto).filter(Boolean),
    ratingAverage: Number(aggregate._avg.rating || 0),
    reviewCount: aggregate._count.id || 0,
  };
};

/** Sales this buyer completed that carry no review yet. */
export const listReviewableSales = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceSale.findMany({
    where: { buyerUserId: actor.id, saleStatus: { in: ["completed", "sold"] }, reviews: { none: {} } },
    include: { listing: { select: { id: true, title: true } }, seller: { select: { id: true, fullName: true } } },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });
  return {
    sales: rows.map((sale: any) => ({
      id: sale.id,
      listingId: sale.listingId,
      listingTitle: sale.listing?.title || "",
      sellerUserId: sale.sellerUserId,
      sellerName: sale.seller?.fullName || "Seller",
      completedAt: sale.updatedAt,
    })),
  };
};

export const addMarketplaceMessage = async (actor: AuthenticatedUser, conversationId: string, payload: Record<string, unknown>) => {
  const conversation = await db.marketplaceConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new HttpError(404, "Conversation not found.");
  if (actor.role !== "admin" && conversation.buyerUserId !== actor.id && conversation.sellerUserId !== actor.id) throw new HttpError(403, "You cannot access this conversation.");
  const messageText = text(payload.messageText || payload.message, 5000);
  if (!messageText) throw new HttpError(400, "messageText is required.");
  const message = await db.marketplaceMessage.create({
    data: { conversationId, senderUserId: actor.id, messageText, offerAmount: numberOrNull(payload.offerAmount) },
  });
  await db.marketplaceConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), status: text(payload.status, 40) || conversation.status } });

  const recipientId = conversation.buyerUserId === actor.id ? conversation.sellerUserId : conversation.buyerUserId;
  if (recipientId) {
    const listing = await db.marketplaceListing.findUnique({ where: { id: conversation.listingId }, select: { title: true } });
    await createNotification({
      recipientId,
      actorId: actor.id,
      type: message.offerAmount !== null ? "marketplace_offer" : "marketplace_message",
      title: message.offerAmount !== null ? "New offer" : "New marketplace message",
      message: `About ${listing?.title || "a listing"}.`,
      metadata: { conversationId, listingId: conversation.listingId },
    });
  }

  return { message: toMarketplaceMessageDto(message, actor.id) };
};

export const upsertMarketplaceSale = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const listingId = text(payload.listingId, 160);
  if (!listingId) throw new HttpError(400, "listingId is required.");
  const listing = await db.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new HttpError(404, "Listing not found.");
  if (actor.role !== "admin" && listing.sellerUserId !== actor.id) throw new HttpError(403, "Only the seller can manage this sale.");
  const sale = await db.marketplaceSale.create({
    data: {
      listingId,
      sellerUserId: listing.sellerUserId,
      buyerUserId: text(payload.buyerUserId, 160),
      buyerName: text(payload.buyerName, 160),
      buyerEmail: text(payload.buyerEmail, 180),
      buyerPhone: text(payload.buyerPhone, 80),
      buyerCountry: text(payload.buyerCountry, 120),
      salePrice: numberOrNull(payload.salePrice),
      currency: text(payload.currency, 12) || listing.currency,
      depositAmount: numberOrNull(payload.depositAmount),
      paymentStatus: text(payload.paymentStatus, 80) || "pending",
      saleStatus: text(payload.saleStatus, 80) || "inquiry",
      handoverMethod: text(payload.handoverMethod, 160),
      handoverDate: dateOrNull(payload.handoverDate),
      notes: text(payload.notes, 5000),
    },
  });
  return { sale };
};

export const createMarketplaceReview = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  const saleId = text(payload.saleId, 160);
  if (!saleId) throw new HttpError(400, "saleId is required.");
  const sale = await db.marketplaceSale.findUnique({ where: { id: saleId } });
  if (!sale) throw new HttpError(404, "Sale not found.");
  const rating = Math.max(1, Math.min(5, Number(payload.rating || 5)));
  const review = await db.marketplaceReview.create({
    data: {
      saleId,
      reviewerUserId: actor.id,
      sellerUserId: sale.sellerUserId,
      rating,
      communicationRating: numberOrNull(payload.communicationRating),
      accuracyRating: numberOrNull(payload.accuracyRating),
      shippingRating: numberOrNull(payload.shippingRating),
      healthRating: numberOrNull(payload.healthRating),
      reviewText: text(payload.reviewText, 5000),
    },
  });
  const aggregate = await db.marketplaceReview.aggregate({ where: { sellerUserId: sale.sellerUserId }, _avg: { rating: true }, _count: { id: true } });
  await db.marketplaceStore.updateMany({
    where: { userId: sale.sellerUserId },
    data: { ratingAverage: aggregate._avg.rating || 0, reviewCount: aggregate._count.id || 0 },
  });
  return { review };
};

export const listAdminMarketplace = async (actor: AuthenticatedUser) => {
  assertAdmin(actor);
  const [listings, stores, conversations] = await Promise.all([
    db.marketplaceListing.findMany({ include: LISTING_INCLUDE, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.marketplaceStore.findMany({ include: STORE_INCLUDE, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.marketplaceConversation.findMany({ include: { listing: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  return { listings: listings.map(toMarketplaceListingDto).filter(Boolean), stores: stores.map((store: any) => toMarketplaceStoreDto(store)), disputes: conversations };
};

export const adminUpdateStore = async (actor: AuthenticatedUser, userId: string, payload: Record<string, unknown>) => {
  assertAdmin(actor);
  const store = await db.marketplaceStore.update({
    where: { userId },
    data: { isVerified: payload.isVerified !== undefined ? bool(payload.isVerified) : undefined },
    include: STORE_INCLUDE,
  });
  return { store: toMarketplaceStoreDto(store) };
};

/**
 * The seller's own collection, projected for the "list an animal" picker.
 *
 * `MarketplaceListing.animalId` has always existed and was never written, so a
 * breeder retyped twenty fields the app already held. This is the read side of
 * closing that gap: enough to choose an animal and see, before listing, how
 * much record it can carry.
 */
export const listSellableAnimals = async (actor: AuthenticatedUser) => {
  await assertSeller(actor);

  const [animals, listings, certificates] = await Promise.all([
    db.animal.findMany({
      where: { ownerId: actor.id, deletedAt: null },
      select: { id: true, appAnimalId: true, name: true, sex: true, species: true, status: true, payload: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    db.marketplaceListing.findMany({
      where: { sellerUserId: actor.id, archivedAt: null, animalId: { not: null } },
      select: { id: true, animalId: true, status: true, availability: true },
    }),
    db.shedTestCertificate.findMany({
      where: { breederId: actor.id },
      select: { animalAppId: true, certificateNumber: true, issuedAt: true },
      orderBy: { issuedAt: "desc" },
    }),
  ]);

  const listedByAnimal = new Map<string, any>();
  listings.forEach((listing: any) => {
    if (listing.animalId && !listedByAnimal.has(listing.animalId)) listedByAnimal.set(listing.animalId, listing);
  });

  const certByAnimal = new Set(certificates.map((cert: any) => cert.animalAppId));

  const animalIds = animals.map((animal: any) => animal.id);
  const parentCounts = animalIds.length
    ? await db.parentRelationship.groupBy({ by: ["childId"], where: { childId: { in: animalIds } }, _count: { _all: true } })
    : [];
  const parentByAnimal = new Map<string, number>();
  parentCounts.forEach((row: any) => parentByAnimal.set(row.childId, row._count?._all || 0));

  const asObject = (value: unknown): Record<string, any> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

  return {
    animals: animals.map((animal: any) => {
      const payload = asObject(animal.payload);
      const logs = asObject(payload.logs);
      const morphs = Array.isArray(payload.morphs) ? payload.morphs : [];
      const hets = Array.isArray(payload.hets) ? payload.hets : [];
      const photos = Array.isArray(payload.photos)
        ? payload.photos.map((photo: any) => (typeof photo === "string" ? photo : photo?.url || photo?.imageUrl)).filter(Boolean)
        : [];
      const imageUrl = payload.imageUrl || payload.photoUrl || photos[0] || "";
      const weights = Array.isArray(logs.weights) ? logs.weights : [];
      const feeds = Array.isArray(logs.feeds) ? logs.feeds : [];
      const listing = listedByAnimal.get(animal.appAnimalId) || null;

      return {
        appAnimalId: animal.appAnimalId,
        name: payload.name || animal.name || animal.appAnimalId,
        sex: payload.sex || animal.sex || "",
        species: payload.species || animal.species || "Ball python",
        status: payload.status || animal.status || "",
        genetics:
          payload.genetics ||
          [...morphs, ...hets.map((het: string) => `het ${het}`)].filter(Boolean).join(", "),
        birthDate: payload.hatchDate || payload.birthDate || payload.dateOfBirth || null,
        weight: payload.weight || (weights.length ? weights[weights.length - 1]?.grams || weights[weights.length - 1]?.weight : "") || "",
        imageUrl,
        photos: photos.slice(0, 12),
        feedingNotes: payload.feedingNotes || "",
        counts: {
          photos: photos.length,
          weights: weights.length,
          feeds: feeds.length,
          parents: parentByAnimal.get(animal.id) || 0,
        },
        hasCertificate: certByAnimal.has(animal.appAnimalId),
        listing: listing
          ? { id: listing.id, status: listing.status, availability: listing.availability }
          : null,
      };
    }),
  };
};


/** Everything this account has saved, newest first. */
export const listMarketplaceFavorites = async (actor: AuthenticatedUser) => {
  const marks = await db.marketplaceFavorite.findMany({
    where: { userId: actor.id },
    include: { listing: { include: LISTING_INCLUDE } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const listings = marks.map((mark: any) => mark.listing).filter((listing: any) => listing && !listing.archivedAt);
  const records = await buildListingRecords(listings);
  return {
    listings: listings
      .map((listing: any) => {
        const dto = toMarketplaceListingDto(listing, records.get(listing.id));
        return dto ? { ...dto, isFavorited: true } : dto;
      })
      .filter(Boolean),
  };
};
