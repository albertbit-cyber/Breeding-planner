export type PricingTierValue = "tier_1_9" | "tier_10_49" | "tier_50_plus";

export interface AnimalOrderInput {
  animalId: string;
  animalName?: string;
  selectedTestIds: string[];
}

export interface CalculatePriceRequest {
  animals: AnimalOrderInput[];
}

export interface PriceBreakdownPerAnimal {
  animalId: string;
  animalName?: string;
  morphBaseCost: number;
  additionalMorphCost: number;
  sexCost: number;
  total: number;
}

export interface PriceBreakdownResponse {
  animalCount: number;
  tier: PricingTierValue;
  currency: string;
  perAnimal: PriceBreakdownPerAnimal[];
  total: number;
}
