export const MARKETPLACE_LISTING_STATUSES = ["draft", "pending_review", "active", "sold", "archived"] as const;
export type MarketplaceListingStatus = (typeof MARKETPLACE_LISTING_STATUSES)[number];

export const MARKETPLACE_ANIMAL_TYPES = ["snake", "gecko", "lizard", "turtle", "other"] as const;
export type MarketplaceAnimalType = (typeof MARKETPLACE_ANIMAL_TYPES)[number];

export interface MarketplaceListingSummary {
  id: string;
  title: string;
  sellerUserId: string;
  animalType: MarketplaceAnimalType;
  status: MarketplaceListingStatus;
  priceCents: number;
  currency: string;
  location?: string;
  primaryImageUrl?: string;
  publishedAt?: string;
}
