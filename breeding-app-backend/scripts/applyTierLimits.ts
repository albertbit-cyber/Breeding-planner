/**
 * Brings the tiers' animal and photo limits to the plan in src/services/tierLimitPlan.ts.
 *
 *   npm run tiers:limits            dry run: prints what would change, writes nothing
 *   npm run tiers:limits -- --apply writes the changes (one transaction) and an admin audit entry
 *
 * Only `tier_features` rows for "animals.create" and "animals.photos" are touched, on tiers that
 * already exist. Prices, other features, subscriptions and every account stay as they are. This is
 * not prisma/seed.ts: the seed also creates demo accounts and resets every feature row, and must
 * never run against staging or production.
 *
 * Safe to run twice: a second run finds nothing to change. Nothing is deleted anywhere. An account
 * that is over a new limit keeps every animal and photo it has; it just cannot add more until it is
 * under the limit, and the dry run says how many accounts that is.
 *
 * It also refreshes the feature catalogue names, so the admin shows "Photos per animal".
 */
import { prisma } from "../src/lib/prisma";
import { countedAnimalWhere } from "../src/services/animalArchive";
import { ensureFeatureCatalog } from "../src/services/subscriptionService";
import { PHOTOS_PER_ANIMAL_FEATURE } from "../src/services/subscriptionCatalog";
import {
  ANIMALS_FEATURE,
  TIER_LIMIT_PLAN,
  describeTarget,
  planTierLimitChanges,
  type TierRow,
} from "../src/services/tierLimitPlan";

const db = prisma as any;
const TAG = "[tiers:limits]";
const ACTIVE = ["active", "trialing", "paused", "past_due"];

/** How many accounts on each tier already hold more than the new limits allow. Counts only. */
const reportOverLimit = async (tiers: TierRow[]) => {
  for (const tier of tiers) {
    const plan = TIER_LIMIT_PLAN[tier.key];
    if (!plan) continue;
    const subscriptions = await db.userSubscription.findMany({
      where: { tierId: tier.id, status: { in: ACTIVE } },
      select: { userId: true },
    });
    const userIds = Array.from(new Set(subscriptions.map((row: any) => row.userId))) as string[];
    if (!userIds.length) {
      console.log(`${TAG}   ${tier.name}: no active accounts`);
      continue;
    }
    const animalLimit = plan[ANIMALS_FEATURE]?.limit ?? null;
    let overAnimals = 0;
    if (animalLimit !== null) {
      for (const userId of userIds) {
        if ((await db.animal.count({ where: countedAnimalWhere(userId) })) > animalLimit) overAnimals += 1;
      }
    }
    const photoLimit = plan[PHOTOS_PER_ANIMAL_FEATURE]?.limit ?? null;
    let overPhotos = 0;
    if (photoLimit !== null) {
      const perAnimal = await db.photo.groupBy({
        by: ["ownerUserId", "animalAppId"],
        where: { ownerUserId: { in: userIds }, kind: { in: ["cover", "gallery", "hatchling"] }, status: { in: ["pending", "ready"] } },
        _count: { _all: true },
      });
      overPhotos = new Set(perAnimal.filter((row: any) => row._count._all > photoLimit).map((row: any) => row.ownerUserId)).size;
    }
    console.log(
      `${TAG}   ${tier.name}: ${userIds.length} active account(s); ${overAnimals} over the animal limit, ${overPhotos} with an animal over the photo limit (stored photos only; photos still on devices are not visible here)`
    );
  }
};

const main = async (): Promise<void> => {
  const apply = process.argv.includes("--apply");
  await ensureFeatureCatalog();

  const tiers: TierRow[] = (await db.subscriptionTier.findMany({
    where: { key: { in: Object.keys(TIER_LIMIT_PLAN) } },
    include: { features: { where: { featureKey: { in: [ANIMALS_FEATURE, PHOTOS_PER_ANIMAL_FEATURE] } } } },
  })).map((tier: any) => ({ id: tier.id, key: tier.key, name: tier.name, features: tier.features }));

  const { changes, unchanged, missingTiers } = planTierLimitChanges(tiers);

  console.log(`${TAG} ${apply ? "APPLY" : "DRY RUN (nothing is written; add --apply to write)"}`);
  for (const change of changes) {
    console.log(`${TAG}   ${change.tierName} · ${change.featureKey}: ${describeTarget(change.before)} -> ${describeTarget(change.after)}`);
  }
  if (!changes.length) console.log(`${TAG}   nothing to change`);
  if (unchanged.length) console.log(`${TAG}   ${unchanged.length} limit(s) already right`);
  if (missingTiers.length) console.log(`${TAG}   not in this database (skipped): ${missingTiers.join(", ")}`);

  console.log(`${TAG} accounts already over the new limits (they keep everything, they just cannot add):`);
  await reportOverLimit(tiers);

  if (!apply || !changes.length) return;

  await db.$transaction(async (tx: any) => {
    for (const change of changes) {
      await tx.tierFeature.upsert({
        where: { tierId_featureKey: { tierId: change.tierId, featureKey: change.featureKey } },
        update: { enabled: change.after.enabled, limitValue: change.after.limit },
        create: { tierId: change.tierId, featureKey: change.featureKey, enabled: change.after.enabled, limitValue: change.after.limit },
      });
    }
    await tx.adminAuditLog.create({
      data: {
        adminUserId: null,
        action: "tier_limits_applied",
        beforeJson: changes.map((change) => ({ tier: change.tierKey, feature: change.featureKey, value: change.before })),
        afterJson: changes.map((change) => ({ tier: change.tierKey, feature: change.featureKey, value: change.after })),
        reason: "Animal and photo limits per tier (scripts/applyTierLimits.ts)",
      },
    });
  });
  console.log(`${TAG} ${changes.length} limit(s) written.`);
};

main()
  .catch((error) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
