export type PricingType = "morph" | "sex";

export type CatalogCategory = "morph" | "sex-determination" | "other";

export interface CatalogTest {
  id: string;
  name: string;
  category: CatalogCategory;
  pricingType: PricingType;
  active: boolean;
  visibleInBreederApp?: boolean;
  description?: string;
  sortOrder?: number;
}

export interface AnimalTestSelection {
  animalId: string;
  selectedTestIds: string[];
}

export interface PriceBreakdownPerAnimal {
  animalId: string;
  morphCount: number;
  hasSexDetermination: boolean;
  morphBaseCost: number;
  additionalMorphCost: number;
  sexAddOnCost: number;
  sexOnlyCost: number;
  sexCost: number;
  morphTotal: number;
  sexTotal: number;
  total: number;
}

export type PricingTier = "1-9" | "10-49" | "50+";

export interface OrderPriceBreakdown {
  animalCount: number;
  tier: PricingTier;
  perAnimal: PriceBreakdownPerAnimal[];
  totalMorphCharges: number;
  totalSexCharges: number;
  total: number;
}

export interface ShedTestCatalogItem {
  id: string;
  name: string;
  category: CatalogCategory;
  pricingType: PricingType;
  active: boolean;
  visibleInBreederApp: boolean;
  description?: string;
  sortOrder?: number;
}

export interface PricingConfig {
  morph: {
    tier1to9: { firstTest: number; additionalTest: number };
    tier10to49: { firstTest: number; additionalTest: number };
    tier50plus: { firstTest: number; additionalTest: number };
  };
  sex: {
    tier1to9: number;
    tier10to49: number;
    tier50plus: number;
  };
  currency: "EUR";
}

export interface CalculatePriceRequest {
  animals: AnimalTestSelection[];
}

export interface PricingSnapshot {
  calculatedAt: string;
  currency: "EUR";
  pricingConfig: PricingConfig;
  animals: AnimalTestSelection[];
  breakdown: OrderPriceBreakdown;
}
