import type { CatalogCategory, PricingType } from "./labPricing";

export interface LabAvailableTest {
  id: string;
  labId: string;
  internalCode: string;
  name: string;
  shortLabel?: string;
  description?: string;
  geneTarget?: string;
  category?: CatalogCategory;
  pricingType: PricingType;
  priceCents?: number;
  currency: string;
  allowedPriorities: Array<"routine" | "priority" | "urgent">;
  isActive: boolean;
  isVisibleToBreeder: boolean;
  sortOrder: number;
  /** morph | sex | panel. A panel is a bundle sold at one flat price. */
  testKind?: string;
  /** tier | flat. Flat-priced tests ignore the laboratory's quantity tiers. */
  priceModel?: string;
  /** Price when bundled onto a morph test on the same animal. */
  addonPriceCents?: number;
  speciesId?: string;
  speciesLabel?: string;
  /** Other names the same test is known by, used to match a breeder's morphs. */
  aliases?: string[];
  /** available | coming_soon. Coming-soon tests are shown but cannot be ordered. */
  availability?: string;
  /** For panels: what the bundle covers, in the laboratory's own words. */
  panelScope?: string;
  /** For panels: member offerings. Empty means the laboratory has not said. */
  panelMemberIds?: string[];
  archivedAt?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LabAvailableTestBreederView {
  id: string;
  name: string;
  shortLabel?: string;
  description?: string;
  geneTarget?: string;
  category?: CatalogCategory;
  pricingType: PricingType;
  priceCents?: number;
  currency: string;
  allowedPriorities: Array<"routine" | "priority" | "urgent">;
}

export type CreateLabAvailableTestInput = {
  /**
   * Which laboratory the test belongs to. Optional now that the backend
   * resolves it from the caller's own membership — a client cannot name a
   * laboratory it does not belong to.
   */
  labId?: string;
  /**
   * Optional provenance link to the shared seed library, set when a lab copies
   * a standard test in as a starting point. Never required: a lab may define a
   * test that exists in no library at all.
   */
  catalogRefId?: string;
  internalCode: string;
  name: string;
  shortLabel?: string;
  description?: string;
  geneTarget?: string;
  category?: CatalogCategory;
  pricingType?: PricingType;
  priceCents?: number;
  currency?: string;
  allowedPriorities?: Array<"routine" | "priority" | "urgent">;
  isActive?: boolean;
  isVisibleToBreeder?: boolean;
  sortOrder?: number;
};

export type UpdateLabAvailableTestInput = {
  id: string;
  labId: string;
  name?: string;
  shortLabel?: string;
  description?: string;
  geneTarget?: string;
  category?: CatalogCategory;
  pricingType?: PricingType;
  priceCents?: number;
  currency?: string;
  allowedPriorities?: Array<"routine" | "priority" | "urgent">;
  isActive?: boolean;
  isVisibleToBreeder?: boolean;
  sortOrder?: number;
};
