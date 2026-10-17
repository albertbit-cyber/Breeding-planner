import { PHOTOS_PER_ANIMAL_FEATURE } from "./subscriptionCatalog";

/**
 * The animal and photo limits per tier, as the owner set them on 16 Oct 2026, with Hobby Keeper
 * (key "hobby") brought to 25 animals on 17 Oct. Hobby Breeder ("hobby_plus") is the owner's to
 * decide (50 or 100) and stays at 100 until they do.
 *
 * `limit: null` is no tier limit (photos still stop at the technical cap, PHOTO_MAX_PER_ANIMAL,
 * 60 by default). A lab is a vendor, not a tier, so the old lab_partner tier is not in the plan:
 * scripts/retireLabTier.ts archives it.
 *
 * prisma/seed.ts carries the same numbers for fresh databases; scripts/applyTierLimits.ts brings
 * an existing database (staging, production) to them without touching anything else.
 */
export type TierLimitTarget = { enabled: boolean; limit: number | null };

export const ANIMALS_FEATURE = "animals.create";

export const TIER_LIMIT_PLAN: Record<string, Record<string, TierLimitTarget>> = {
  free: {
    [ANIMALS_FEATURE]: { enabled: true, limit: 10 },
    [PHOTOS_PER_ANIMAL_FEATURE]: { enabled: true, limit: 3 },
  },
  hobby: {
    [ANIMALS_FEATURE]: { enabled: true, limit: 25 },
    [PHOTOS_PER_ANIMAL_FEATURE]: { enabled: true, limit: 5 },
  },
  hobby_plus: {
    [ANIMALS_FEATURE]: { enabled: true, limit: 100 },
    [PHOTOS_PER_ANIMAL_FEATURE]: { enabled: true, limit: 7 },
  },
  breeder: {
    [ANIMALS_FEATURE]: { enabled: true, limit: 250 },
    [PHOTOS_PER_ANIMAL_FEATURE]: { enabled: true, limit: 9 },
  },
  professional_breeder: {
    [ANIMALS_FEATURE]: { enabled: true, limit: 500 },
    [PHOTOS_PER_ANIMAL_FEATURE]: { enabled: true, limit: null },
  },
  enterprise: {
    [ANIMALS_FEATURE]: { enabled: true, limit: null },
    [PHOTOS_PER_ANIMAL_FEATURE]: { enabled: true, limit: null },
  },
};

export type TierFeatureRow = { featureKey: string; enabled: boolean; limitValue: number | null };
export type TierRow = { id: string; key: string; name: string; features: TierFeatureRow[] };

export type TierLimitChange = {
  tierId: string;
  tierKey: string;
  tierName: string;
  featureKey: string;
  before: TierLimitTarget | null;
  after: TierLimitTarget;
};

const same = (row: TierFeatureRow | undefined, target: TierLimitTarget) =>
  Boolean(row) && Boolean(row!.enabled) === target.enabled && (row!.limitValue ?? null) === target.limit;

/**
 * What has to change to bring `tiers` to the plan. Pure, so the dry run and the write agree by
 * construction. Tiers in the plan that the database does not have are reported, not created:
 * creating a tier is a pricing decision, not a limit change.
 */
export function planTierLimitChanges(tiers: TierRow[], plan = TIER_LIMIT_PLAN) {
  const byKey = new Map(tiers.map((tier) => [tier.key, tier]));
  const changes: TierLimitChange[] = [];
  const unchanged: TierLimitChange[] = [];
  const missingTiers: string[] = [];
  for (const [tierKey, features] of Object.entries(plan)) {
    const tier = byKey.get(tierKey);
    if (!tier) {
      missingTiers.push(tierKey);
      continue;
    }
    for (const [featureKey, target] of Object.entries(features)) {
      const row = tier.features.find((entry) => entry.featureKey === featureKey);
      const entry: TierLimitChange = {
        tierId: tier.id,
        tierKey,
        tierName: tier.name,
        featureKey,
        before: row ? { enabled: Boolean(row.enabled), limit: row.limitValue ?? null } : null,
        after: target,
      };
      (same(row, target) ? unchanged : changes).push(entry);
    }
  }
  return { changes, unchanged, missingTiers };
}

export const describeTarget = (target: TierLimitTarget | null) => {
  if (!target) return "(no row)";
  if (!target.enabled) return "off";
  return target.limit === null ? "unlimited" : String(target.limit);
};
