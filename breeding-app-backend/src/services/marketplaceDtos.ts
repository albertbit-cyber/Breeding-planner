const compactObject = <T extends Record<string, unknown>>(input: T): T =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;

export const toLegacyListingDto = (row: any) => {
  if (!row) return null;
  return compactObject({
    id: row.appListingId,
    rowId: row.id,
    ownerId: row.ownerId,
    animalAppId: row.animalAppId,
    title: row.title,
    status: row.status,
    priceCents: row.priceCents,
    currency: row.currency,
    updatedAt: row.updatedAt,
  });
};

export const toLegacyPublicListingDto = (row: any) => {
  const listing = toLegacyListingDto(row);
  if (!listing) return null;
  return compactObject({
    ...listing,
    breeder: row.owner?.profile
      ? {
          userId: row.owner.id,
          breederName: row.owner.profile.breederName || row.owner.fullName,
          location: row.owner.profile.location,
          publicContactEmail: row.owner.profile.publicContactEmail,
          publicContactPhone: row.owner.profile.publicContactPhone,
          contactPreference: row.owner.profile.contactPreference,
        }
      : undefined,
  });
};

export const toLegacyModerationListingDto = (row: any) => {
  const listing = toLegacyListingDto(row);
  if (!listing) return null;
  return compactObject({
    ...listing,
    breeder: row.owner
      ? {
          userId: row.owner.id,
          fullName: row.owner.fullName,
          email: row.owner.email,
          role: row.owner.role,
          breederName: row.owner.profile?.breederName || row.owner.fullName,
          isPublic: row.owner.profile?.isPublic === true,
        }
      : undefined,
  });
};

export const toMarketplaceListingDto = (row: any) => {
  if (!row) return null;
  const store = row.seller?.marketplaceStores?.[0] || null;
  const profile = row.seller?.profile || {};
  return compactObject({
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

export const toMarketplaceStoreDto = (row: any, listings: any[] = [], reviews: any[] = []) => ({
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
  listings: listings.map(toMarketplaceListingDto).filter(Boolean),
  reviews,
});

export const assertNoPrivateListingFields = (value: unknown): boolean => {
  const serialized = JSON.stringify(value);
  return !/(passwordHash|refreshToken|buyerEmail|buyerPhone|internalNote|payload)/i.test(serialized);
};

