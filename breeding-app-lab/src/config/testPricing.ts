import type { PricingTier } from "../types/labPricing";
import type { PricingConfig } from "../types/labPricing";

export type MorphTierRule = {
  firstMorphCents: number;
  additionalMorphCents: number;
};

export type SexTierRule = {
  sexPerAnimalCents: number;
};

export const SEX_WITH_MORPH_ADD_ON_CENTS = 1000;

export const MORPH_TIER_RULES: Record<PricingTier, MorphTierRule> = {
  "1-9": { firstMorphCents: 3500, additionalMorphCents: 2000 },
  "10-49": { firstMorphCents: 3000, additionalMorphCents: 2000 },
  "50+": { firstMorphCents: 2500, additionalMorphCents: 2000 },
};

export const SEX_TIER_RULES: Record<PricingTier, SexTierRule> = {
  "1-9": { sexPerAnimalCents: 3000 },
  "10-49": { sexPerAnimalCents: 2500 },
  "50+": { sexPerAnimalCents: 2000 },
};

export const resolvePricingTier = (animalCount: number): PricingTier => {
  if (animalCount >= 50) return "50+";
  if (animalCount >= 10) return "10-49";
  return "1-9";
};

export const getAnimalTier = (animalCount: number): PricingTier => resolvePricingTier(animalCount);

export const EUR_CURRENCY = "EUR";

export const LAB_PRICING_CONFIG: PricingConfig = {
  currency: "EUR",
  morph: {
    tier1to9: { firstTest: 35, additionalTest: 20 },
    tier10to49: { firstTest: 30, additionalTest: 20 },
    tier50plus: { firstTest: 25, additionalTest: 20 },
  },
  sex: {
    tier1to9: 30,
    tier10to49: 25,
    tier50plus: 20,
  },
};

const euroToCents = (value: number): number => Math.round(Number(value || 0) * 100);

export const getMorphBasePrice = (
  animalCount: number,
  config: PricingConfig = LAB_PRICING_CONFIG
): number => {
  const tier = getAnimalTier(animalCount);
  const rules = pricingConfigToTierRules(config);
  return rules.morph[tier].firstMorphCents;
};

export const getAdditionalMorphPrice = (
  animalCount: number,
  config: PricingConfig = LAB_PRICING_CONFIG
): number => {
  const tier = getAnimalTier(animalCount);
  const rules = pricingConfigToTierRules(config);
  return rules.morph[tier].additionalMorphCents;
};

export const getSexOnlyBasePrice = (
  animalCount: number,
  config: PricingConfig = LAB_PRICING_CONFIG
): number => {
  const tier = getAnimalTier(animalCount);
  const rules = pricingConfigToTierRules(config);
  return rules.sex[tier].sexPerAnimalCents;
};

export const getSexWithMorphAddOnPrice = (): number => SEX_WITH_MORPH_ADD_ON_CENTS;

export const pricingConfigToTierRules = (config: PricingConfig = LAB_PRICING_CONFIG) => {
  return {
    morph: {
      "1-9": {
        firstMorphCents: euroToCents(config.morph.tier1to9.firstTest),
        additionalMorphCents: euroToCents(config.morph.tier1to9.additionalTest),
      },
      "10-49": {
        firstMorphCents: euroToCents(config.morph.tier10to49.firstTest),
        additionalMorphCents: euroToCents(config.morph.tier10to49.additionalTest),
      },
      "50+": {
        firstMorphCents: euroToCents(config.morph.tier50plus.firstTest),
        additionalMorphCents: euroToCents(config.morph.tier50plus.additionalTest),
      },
    } as Record<PricingTier, MorphTierRule>,
    sex: {
      "1-9": { sexPerAnimalCents: euroToCents(config.sex.tier1to9) },
      "10-49": { sexPerAnimalCents: euroToCents(config.sex.tier10to49) },
      "50+": { sexPerAnimalCents: euroToCents(config.sex.tier50plus) },
    } as Record<PricingTier, SexTierRule>,
  };
};
