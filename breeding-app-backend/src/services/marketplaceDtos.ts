import { parseGeneticClaims, withLabResults } from "./marketplaceGenetics";

const compactObject = <T extends Record<string, unknown>>(input: T): T =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;

/**
 * A listing as the breeder profile surface shows it. Built from
 * `marketplace_listings`; the field names are the ones the legacy `listings`
 * table used, so the profile response kept its shape when its source moved.
 */
export const toProfileListingDto = (row: any) => {
  if (!row) return null;
  const price = row.price === null || row.price === undefined ? null : Number(row.price);
  return compactObject({
    id: row.id,
    rowId: row.id,
    ownerId: row.sellerUserId,
    animalAppId: row.animalId ?? undefined,
    title: row.title,
    status: row.status,
    price: price === null || !Number.isFinite(price) ? undefined : price,
    priceCents: price === null || !Number.isFinite(price) ? undefined : Math.round(price * 100),
    currency: row.currency,
    updatedAt: row.updatedAt,
  });
};

export const toMarketplaceListingDto = (row: any, record?: any) => {
  if (!row) return null;
  const store = row.seller?.marketplaceStores?.[0] || null;
  const profile = row.seller?.profile || {};
  return compactObject({
    provenance: record?.provenance || { photos: false, weights: false, lineage: false, verifiedGenetics: false, filled: 0 },
    record: record
      ? {
          weights: record.weights || [],
          feeding: record.feeding || null,
          lineage: record.lineage || null,
          certificate: record.certificate || null,
        }
      : undefined,
    // Each claim with its own provenance. The certificate only counts where the
    // seller published it, which is exactly when the record carries it.
    geneticClaims: withLabResults(
      parseGeneticClaims(row.genetics),
      record?.certificate?.lines,
      record?.certificate?.certificateNumber || null
    ),
    id: row.id,
    sellerUserId: row.sellerUserId,
    animalId: row.animalId,
    title: row.title,
    species: row.species || "Ball python",
    category: row.category || "",
    genetics: row.genetics || "",
    sex: row.sex || "",
    birthDate: row.birthDate,
    year: row.year,
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    currency: row.currency,
    status: row.status,
    availability: row.availability,
    country: row.country || profile.country || profile.location || "",
    city: row.city || profile.city || "",
    shippingAvailable: row.shippingAvailable,
    pickupAvailable: row.pickupAvailable,
    description: row.description || "",
    feedingNotes: row.feedingNotes || "",
    temperamentNotes: row.temperamentNotes || "",
    publicDataSettings: row.publicDataSettingsJson || {},
    viewsCount: row.viewsCount,
    favoritesCount: row.favoritesCount,
    isFeatured: row.isFeatured,
    images: (row.images || []).map((image: any) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      sortOrder: image.sortOrder,
      isPrimary: image.isPrimary,
    })),
    imageUrl: row.images?.[0]?.imageUrl || "",
    seller: row.seller
      ? {
          id: row.seller.id,
          name: store?.storeName || profile.breederName || row.seller.fullName,
          location: [profile.city, profile.country || profile.location].filter(Boolean).join(", "),
          isVerified: Boolean(store?.isVerified || row.seller.verificationStatus === "approved"),
          ratingAverage: store?.ratingAverage === undefined ? 0 : Number(store.ratingAverage),
          reviewCount: store?.reviewCount || 0,
          responseTime: "Usually within 24 hours",
          accountAge: row.seller.id ? "Active seller" : "",
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  });
};

/**
 * Conversations used to be returned as raw Prisma rows, which handed each side
 * the other party's e-mail address. The thread only ever needs a display name.
 */
export const toMarketplaceMessageDto = (row: any, viewerId?: string) => {
  if (!row) return null;
  return compactObject({
    id: row.id,
    conversationId: row.conversationId,
    senderUserId: row.senderUserId,
    mine: Boolean(viewerId && row.senderUserId === viewerId),
    messageText: row.messageText,
    offerAmount: row.offerAmount === null || row.offerAmount === undefined ? null : Number(row.offerAmount),
    createdAt: row.createdAt,
    readAt: row.readAt,
  });
};

export const toMarketplaceConversationDto = (row: any, viewerId?: string) => {
  if (!row) return null;
  const isSeller = viewerId ? row.sellerUserId === viewerId : false;
  const counterparty = isSeller ? row.buyer : row.seller;
  const messages = (row.messages || []).map((message: any) => toMarketplaceMessageDto(message, viewerId));
  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const offers = messages.filter((message: any) => message && message.offerAmount !== null);
  return compactObject({
    id: row.id,
    listingId: row.listingId,
    status: row.status,
    role: isSeller ? "seller" : "buyer",
    listing: row.listing
      ? {
          id: row.listing.id,
          title: row.listing.title,
          price: row.listing.price === null || row.listing.price === undefined ? null : Number(row.listing.price),
          currency: row.listing.currency,
          availability: row.listing.availability,
          status: row.listing.status,
          imageUrl: row.listing.images?.[0]?.imageUrl || "",
        }
      : null,
    counterparty: counterparty
      ? { id: counterparty.id, name: counterparty.fullName || "Marketplace user" }
      : null,
    messages,
    lastMessage,
    latestOffer: offers.length ? offers[offers.length - 1] : null,
    unreadCount: messages.filter(
      (message: any) => message && !message.mine && !message.readAt
    ).length,
    sale: row.sale
      ? {
          id: row.sale.id,
          saleStatus: row.sale.saleStatus,
          paymentStatus: row.sale.paymentStatus,
          salePrice: row.sale.salePrice === null || row.sale.salePrice === undefined ? null : Number(row.sale.salePrice),
          depositAmount:
            row.sale.depositAmount === null || row.sale.depositAmount === undefined ? null : Number(row.sale.depositAmount),
          handoverMethod: row.sale.handoverMethod,
          handoverDate: row.sale.handoverDate,
          // Only the buyer can review, so only the buyer's view needs to know.
          reviewed: Array.isArray(row.sale.reviews) ? row.sale.reviews.length > 0 : false,
          isBuyer: Boolean(viewerId && row.sale.buyerUserId === viewerId),
        }
      : null,
    // "by_me" lets the blocker undo it. "by_them" is shown only as a closed
    // thread: who blocked whom is not the blocked party's to know in detail.
    blocked: row.blocked || null,
    lastMessageAt: row.lastMessageAt,
    updatedAt: row.updatedAt,
  });
};

export const toMarketplaceReviewDto = (row: any) => {
  if (!row) return null;
  return compactObject({
    id: row.id,
    rating: row.rating,
    communicationRating: row.communicationRating,
    accuracyRating: row.accuracyRating,
    shippingRating: row.shippingRating,
    healthRating: row.healthRating,
    reviewText: row.reviewText || "",
    reviewerName: row.reviewer?.fullName || "Verified buyer",
    listingTitle: row.sale?.listing?.title || "",
    createdAt: row.createdAt,
  });
};

export const toMarketplaceStoreDto = (row: any, listings: any[] = [], reviews: any[] = [], records?: Map<string, any>) => ({
  id: row.id,
  userId: row.userId,
  storeName: row.storeName,
  logoUrl: row.logoUrl || "",
  bannerUrl: row.bannerUrl || "",
  about: row.about || "",
  country: row.country || "",
  city: row.city || "",
  websiteUrl: row.websiteUrl || "",
  socialLinks: row.socialLinksJson || {},
  terms: row.terms || "",
  shippingPolicy: row.shippingPolicy || "",
  paymentPolicy: row.paymentPolicy || "",
  isVerified: row.isVerified,
  ratingAverage: Number(row.ratingAverage || 0),
  reviewCount: row.reviewCount || 0,
  user: row.user
    ? {
        id: row.user.id,
        fullName: row.user.fullName,
        verificationStatus: row.user.verificationStatus,
      }
    : null,
  listings: listings.map((listing) => toMarketplaceListingDto(listing, records?.get(listing?.id))).filter(Boolean),
  reviews: reviews.map(toMarketplaceReviewDto).filter(Boolean),
});

export const assertNoPrivateListingFields = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return !/(passwordHash|refreshToken|buyerEmail|buyerPhone|internalNote|payload)/i.test(serialized);
};

