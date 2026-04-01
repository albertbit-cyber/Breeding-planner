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
  labId: string;
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
  sortOrder?: number;
};
