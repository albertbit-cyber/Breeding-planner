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

type TierKey = "t1" | "t2" | "t3";

type CatalogShape = {
  id: string;
  name: string;
  pricingType: "morph" | "sex";
  active: boolean;
  /** morph | sex | panel. Absent on legacy rows, which are all morph or sex. */
  testKind?: string | null;
  /** tier | flat. Absent means tier. */
  priceModel?: string | null;
  priceCents?: number | null;
  /** Per-offering tier override, in cents: { t1, t2, t3 }. */
  tierPricesJson?: Partial<Record<TierKey, number>> | null;
  /** Charged instead of the full price when bundled with a morph test. */
  addonPriceCents?: number | null;
  availability?: string | null;
};

const TIER_KEYS: Record<PricingTierValue, TierKey> = {
  tier_1_9: "t1",
  tier_10_49: "t2",
  tier_50_plus: "t3",
};

const centsToUnits = (cents: number): number => Math.round(cents) / 100;

const isFlatPriced = (test: CatalogShape): boolean =>
  String(test.priceModel || "tier") === "flat" || String(test.testKind || "") === "panel";

/**
 * A test's own tier price, when the laboratory has priced it on a different
 * scale from the rest of its catalogue. Returns null to mean "use the
 * laboratory's tier table", which is the common case.
 */
const ownTierPrice = (test: CatalogShape, tier: PricingTierValue): number | null => {
  const overrides = test.tierPricesJson;
  if (!overrides) return null;
  const value = overrides[TIER_KEYS[tier]];
  return typeof value === "number" && Number.isFinite(value) ? centsToUnits(value) : null;
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
  selectedCatalogTests: CatalogShape[];
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
      if (String(test.availability || "available") === "coming_soon") {
        throw new HttpError(400, `${test.name} is not available to order yet.`);
      }
      return test;
    });

    // Flat-priced items (panels, and anything a laboratory has chosen to price
    // outright) sit outside the tier table entirely: a bundle's whole appeal is
    // that its price does not move with order size.
    const flatTests = selected.filter(isFlatPriced);
    const tieredTests = selected.filter((test) => !isFlatPriced(test));

    const panelCost = flatTests.reduce((sum, test) => sum + centsToUnits(test.priceCents ?? 0), 0);

    const morphTests = tieredTests.filter((test) => test.pricingType === "morph");
    const sexTests = tieredTests.filter((test) => test.pricingType === "sex");

    const morphBaseCost = morphTests.length > 0
      ? ownTierPrice(morphTests[0], tier) ?? tierPricing.morphFirst
      : 0;
    const additionalMorphCost = morphTests.length > 1
      ? morphTests
          .slice(1)
          .reduce((sum, test) => sum + (ownTierPrice(test, tier) ?? tierPricing.morphAdditional), 0)
      : 0;

    // A morph test already on this animal makes a sex test an add-on, which is
    // how laboratories usually sell it — the sample and the extraction are
    // shared, so only the extra assay is charged.
    const hasMorphWork = morphTests.length > 0 || flatTests.length > 0;
    const sexCost = sexTests.reduce((sum, test) => {
      if (hasMorphWork && typeof test.addonPriceCents === "number") {
        return sum + centsToUnits(test.addonPriceCents);
      }
      return sum + (ownTierPrice(test, tier) ?? tierPricing.sex);
    }, 0);

    const total = morphBaseCost + additionalMorphCost + sexCost + panelCost;

    return {
      animalId: animal.animalId,
      animalName: animal.animalName,
      morphBaseCost,
      additionalMorphCost,
      sexCost,
      panelCost,
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
    panelCost: row.panelCost,
    total: row.total,
  })),
  total: breakdown.total,
});
