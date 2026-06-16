import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AuthenticatedUser } from "../types/auth";
import { canAccessFeature } from "./subscriptionService";
import { createNotification } from "./notificationService";
import { toMarketplaceListingDto, toMarketplaceStoreDto } from "./marketplaceDtos";
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
  species: "Ball python",
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

export const listMarketplaceListings = async (query: Record<string, unknown>) => {
  const search = text(query.search, 160);
  const where: any = { status: { in: ["available", "reserved", "sold"] }, archivedAt: null, species: { equals: "Ball python", mode: "insensitive" } };
  if (text(query.sex, 40)) where.sex = text(query.sex, 40);
  if (text(query.availability, 40)) where.availability = text(query.availability, 40);
  if (text(query.country, 120)) where.country = { contains: text(query.country, 120), mode: "insensitive" };
  if (query.shippingAvailable !== undefined && query.shippingAvailable !== "") where.shippingAvailable = bool(query.shippingAvailable);
  if (query.pickupAvailable !== undefined && query.pickupAvailable !== "") where.pickupAvailable = bool(query.pickupAvailable);
  const minPrice = numberOrNull(query.minPrice);
  const maxPrice = numberOrNull(query.maxPrice);
  if (minPrice !== null || maxPrice !== null) where.price = {};
  if (minPrice !== null) where.price.gte = minPrice;
  if (maxPrice !== null) where.price.lte = maxPrice;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { genetics: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
    ];
  }
  const sort = text(query.sort, 80) || "newest";
  const orderBy = sort === "price_low" ? [{ price: "asc" }] : sort === "price_high" ? [{ price: "desc" }] : sort === "updated" ? [{ updatedAt: "desc" }] : [{ isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }];
  const rows = await db.marketplaceListing.findMany({ where, include: LISTING_INCLUDE, orderBy, take: 200 });
  return { listings: rows.map(toMarketplaceListingDto).filter(Boolean) };
};

export const getMarketplaceListing = async (id: string) => {
  const listing = await db.marketplaceListing.update({
    where: { id },
    data: { viewsCount: { increment: 1 } },
    include: LISTING_INCLUDE,
  }).catch(async () => db.marketplaceListing.findUnique({ where: { id }, include: LISTING_INCLUDE }));
  if (!listing) throw new HttpError(404, "Marketplace listing not found.");
  return { listing: toMarketplaceListingDto(listing) };
};

export const listSellerDashboard = async (actor: AuthenticatedUser) => {
  await assertSeller(actor);
  const [listings, store, conversations, sales] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerUserId: actor.id }, include: LISTING_INCLUDE, orderBy: { updatedAt: "desc" } }),
    db.marketplaceStore.findUnique({ where: { userId: actor.id }, include: STORE_INCLUDE }),
    db.marketplaceConversation.findMany({ where: { sellerUserId: actor.id }, include: { listing: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.marketplaceSale.findMany({ where: { sellerUserId: actor.id }, include: { listing: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  return {
    store,
    listings: listings.map(toMarketplaceListingDto).filter(Boolean),
    conversations,
    sales,
    analytics: {
      activeListings: listings.filter((item: any) => item.status === "available").length,
      draftListings: listings.filter((item: any) => item.status === "draft").length,
      reservedListings: listings.filter((item: any) => item.availability === "reserved").length,
      soldListings: listings.filter((item: any) => item.availability === "sold").length,
      favoritesCount: listings.reduce((sum: number, item: any) => sum + Number(item.favoritesCount || 0), 0),
      viewsCount: listings.reduce((sum: number, item: any) => sum + Number(item.viewsCount || 0), 0),
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
    db.marketplaceListing.findMany({ where: { sellerUserId: userId, archivedAt: null }, include: LISTING_INCLUDE, orderBy: { updatedAt: "desc" } }),
    db.marketplaceReview.findMany({ where: { sellerUserId: userId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { store: toMarketplaceStoreDto(store, listings, reviews) };
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
  return { conversation };
};

export const listMarketplaceConversations = async (actor: AuthenticatedUser) => {
  const rows = await db.marketplaceConversation.findMany({
    where: { OR: [{ buyerUserId: actor.id }, { sellerUserId: actor.id }, ...(actor.role === "admin" ? [{}] : [])] },
    include: { listing: true, messages: { orderBy: { createdAt: "asc" } }, buyer: { select: { id: true, fullName: true, email: true } }, seller: { select: { id: true, fullName: true, email: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return { conversations: rows };
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
  return { message };
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
