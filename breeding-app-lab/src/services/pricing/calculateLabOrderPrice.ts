import {
  LAB_PRICING_CONFIG,
  MORPH_TIER_RULES,
  SEX_TIER_RULES,
  getAdditionalMorphPrice,
  getAnimalTier,
  getMorphBasePrice,
  getSexOnlyBasePrice,
  getSexWithMorphAddOnPrice,
} from "../../config/testPricing";
import type {
  AnimalTestSelection,
  CatalogTest,
  OrderPriceBreakdown,
  PriceBreakdownPerAnimal,
  PricingConfig,
  PricingTier,
} from "../../types/labPricing";

const asActiveCatalog = (catalog: CatalogTest[]): Map<string, CatalogTest> => {
  const map = new Map<string, CatalogTest>();
  catalog.forEach((entry) => {
    if (!entry || entry.active === false || entry.visibleInBreederApp === false) return;
    map.set(entry.id, entry);
  });
  return map;
};

export const calculateLabOrderPrice = (
  orderAnimals: AnimalTestSelection[],
  catalog: CatalogTest[],
  pricingConfig: PricingConfig = LAB_PRICING_CONFIG
): OrderPriceBreakdown => {
  const normalizedAnimals = Array.isArray(orderAnimals)
    ? orderAnimals.filter((item) => String(item?.animalId || "").trim())
    : [];

  const animalCount = normalizedAnimals.length;
  const tier = getAnimalTier(animalCount);
  const activeCatalogMap = asActiveCatalog(catalog || []);

  const perAnimal: PriceBreakdownPerAnimal[] = normalizedAnimals.map((animal) => {
    const selectedUniqueIds = Array.from(new Set((animal.selectedTestIds || []).map((id) => String(id || "").trim()).filter(Boolean)));

    let morphCount = 0;
    let hasSexSelection = false;

    selectedUniqueIds.forEach((testId) => {
      const test = activeCatalogMap.get(testId);
      if (!test) return;
      if (test.pricingType === "morph") {
        morphCount += 1;
        return;
      }
      if (test.pricingType === "sex") {
        hasSexSelection = true;
      }
    });

    const morphBaseCost = morphCount > 0 ? getMorphBasePrice(animalCount, pricingConfig) : 0;
    const additionalMorphCost = morphCount > 1
      ? (morphCount - 1) * getAdditionalMorphPrice(animalCount, pricingConfig)
      : 0;
    const sexAddOnCost = morphCount > 0 && hasSexSelection ? getSexWithMorphAddOnPrice() : 0;
    const sexOnlyCost = morphCount === 0 && hasSexSelection ? getSexOnlyBasePrice(animalCount, pricingConfig) : 0;
    const sexCost = sexAddOnCost + sexOnlyCost;
    const morphTotal = morphBaseCost + additionalMorphCost;
    const sexTotal = sexCost;
    const total = morphTotal + sexTotal;

    return {
      animalId: animal.animalId,
      morphCount,
      hasSexDetermination: hasSexSelection,
      morphBaseCost,
      additionalMorphCost,
      sexAddOnCost,
      sexOnlyCost,
      sexCost,
      morphTotal,
      sexTotal,
      total,
    };
  });

  const total = perAnimal.reduce((sum, row) => sum + row.total, 0);
  const totalMorphCharges = perAnimal.reduce((sum, row) => sum + row.morphTotal, 0);
  const totalSexCharges = perAnimal.reduce((sum, row) => sum + row.sexTotal, 0);

  return {
    animalCount,
    tier,
    perAnimal,
    totalMorphCharges,
    totalSexCharges,
    total,
  };
};

export const summarizeTierRules = (): Array<{
  tier: PricingTier;
  morphFirstCents: number;
  morphAdditionalCents: number;
  sexPerAnimalCents: number;
}> => {
  const tiers: PricingTier[] = ["1-9", "10-49", "50+"];
  return tiers.map((tier) => ({
    tier,
    morphFirstCents: MORPH_TIER_RULES[tier].firstMorphCents,
    morphAdditionalCents: MORPH_TIER_RULES[tier].additionalMorphCents,
    sexPerAnimalCents: SEX_TIER_RULES[tier].sexPerAnimalCents,
  }));
};
