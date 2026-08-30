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
