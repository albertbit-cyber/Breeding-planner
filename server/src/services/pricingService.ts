import type { AnimalOrderInput, PriceBreakdownPerAnimal, PriceBreakdownResponse, PricingTierValue } from "../types/api";
import { HttpError } from "../utils/errors";

type PricingConfigShape = {
  id: string;
  currency: string;
  morphTier1to9FirstTest: { toString(): string } | number;
  morphTier1to9AdditionalTest: { toString(): string } | number;
  morphTier10to49FirstTest: { toString(): string } | number;
  morphTier10to49AdditionalTest: { toString(): string } | number;
  morphTier50PlusFirstTest: { toString(): string } | number;
  morphTier50PlusAdditionalTest: { toString(): string } | number;
  sexTier1to9: { toString(): string } | number;
  sexTier10to49: { toString(): string } | number;
  sexTier50Plus: { toString(): string } | number;
};

type CatalogShape = {
  id: string;
  name: string;
  pricingType: "morph" | "sex";
  active: boolean;
};

const decimalToNumber = (value: { toString(): string } | number): number => Number(value.toString());

const getTier = (animalCount: number): PricingTierValue => {
  if (animalCount <= 9) return "tier_1_9";
  if (animalCount <= 49) return "tier_10_49";
  return "tier_50_plus";
};

const getTierPricing = (tier: PricingTierValue, config: PricingConfigShape) => {
  if (tier === "tier_1_9") {
    return {
      morphFirst: decimalToNumber(config.morphTier1to9FirstTest),
      morphAdditional: decimalToNumber(config.morphTier1to9AdditionalTest),
      sex: decimalToNumber(config.sexTier1to9),
    };
  }
  if (tier === "tier_10_49") {
    return {
      morphFirst: decimalToNumber(config.morphTier10to49FirstTest),
      morphAdditional: decimalToNumber(config.morphTier10to49AdditionalTest),
      sex: decimalToNumber(config.sexTier10to49),
    };
  }
  return {
    morphFirst: decimalToNumber(config.morphTier50PlusFirstTest),
    morphAdditional: decimalToNumber(config.morphTier50PlusAdditionalTest),
    sex: decimalToNumber(config.sexTier50Plus),
  };
};

export interface EnrichedAnimalBreakdown extends PriceBreakdownPerAnimal {
  selectedCatalogTests: Array<Pick<CatalogShape, "id" | "name" | "pricingType">>;
}

export interface InternalBreakdown {
  animalCount: number;
  tier: PricingTierValue;
  currency: string;
  perAnimal: EnrichedAnimalBreakdown[];
  total: number;
}

export const calculateOrderBreakdown = (
  animals: AnimalOrderInput[],
  catalog: CatalogShape[],
  activePricing: PricingConfigShape
): InternalBreakdown => {
  if (!activePricing) {
    throw new HttpError(400, "No active pricing configuration found.");
  }

  const catalogMap = new Map(catalog.map((test) => [test.id, test]));
  const activeCatalog = catalog.filter((test) => test.active);

  const tier = getTier(animals.length);
  const tierPricing = getTierPricing(tier, activePricing);

  const perAnimal = animals.map<EnrichedAnimalBreakdown>((animal) => {
    const selected = animal.selectedTestIds.map((testId) => {
      const test = catalogMap.get(testId);
      if (!test || !test.active) {
        throw new HttpError(400, `Selected test is invalid or inactive: ${testId}`);
      }
      return { id: test.id, name: test.name, pricingType: test.pricingType };
    });

    const morphTests = selected.filter((test) => test.pricingType === "morph");
    const sexTests = selected.filter((test) => test.pricingType === "sex");

    const morphBaseCost = morphTests.length > 0 ? tierPricing.morphFirst : 0;
    const additionalMorphCost = morphTests.length > 1 ? (morphTests.length - 1) * tierPricing.morphAdditional : 0;
    const sexCost = sexTests.length > 0 ? tierPricing.sex : 0;
    const total = morphBaseCost + additionalMorphCost + sexCost;

    return {
      animalId: animal.animalId,
      animalName: animal.animalName,
      morphBaseCost,
      additionalMorphCost,
      sexCost,
      total,
      selectedCatalogTests: selected,
    };
  });

  const total = perAnimal.reduce((sum, row) => sum + row.total, 0);

  // Temporary debug logs requested.
  console.log("[pricing] matched test catalog items", activeCatalog.map((item) => ({ id: item.id, active: item.active })));
  console.log("[pricing] active pricing config", {
    id: activePricing.id,
    currency: activePricing.currency,
    tier,
  });
  console.log("[pricing] final computed breakdown", { animalCount: animals.length, tier, total });

  return {
    animalCount: animals.length,
    tier,
    currency: activePricing.currency,
    perAnimal,
    total,
  };
};

export const toPublicBreakdown = (breakdown: InternalBreakdown): PriceBreakdownResponse => ({
  animalCount: breakdown.animalCount,
  tier: breakdown.tier,
  currency: breakdown.currency,
  perAnimal: breakdown.perAnimal.map((row) => ({
    animalId: row.animalId,
    animalName: row.animalName,
    morphBaseCost: row.morphBaseCost,
    additionalMorphCost: row.additionalMorphCost,
    sexCost: row.sexCost,
    total: row.total,
  })),
  total: breakdown.total,
});
