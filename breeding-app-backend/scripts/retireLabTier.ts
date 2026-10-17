/**
 * Retires the old "lab_partner" subscription tier. A lab is a vendor serving Serpentora (the
 * admin's Labs section, LabAccount, the lab portal), not a customer on a plan, so the tier should
 * not be on the pricing page or in the tier matrix.
 *
 *   npm run tiers:retire-lab              dry run: says what it would do, writes nothing
 *   npm run tiers:retire-lab -- --apply   archives the tier (hidden, inactive), with an audit entry
 *
 * Archive, not delete: the row and its history stay. It refuses while any account is still on the
 * tier, and lists them, because moving an account to another plan is the owner's decision.
 */
import { prisma } from "../src/lib/prisma";

const db = prisma as any;
const TAG = "[tiers:retire-lab]";
const ACTIVE = ["active", "trialing", "paused", "past_due"];
const LAB_TIER_KEY = "lab_partner";

const main = async () => {
  const apply = process.argv.includes("--apply");
  const tier = await db.subscriptionTier.findUnique({ where: { key: LAB_TIER_KEY } });
  if (!tier) {
    console.log(`${TAG} no "${LAB_TIER_KEY}" tier in this database; nothing to do.`);
    return;
  }
  if (tier.archivedAt) {
    console.log(`${TAG} "${tier.name}" was already archived on ${tier.archivedAt.toISOString()}; nothing to do.`);
    return;
  }

  const subscriptions = await db.userSubscription.findMany({
    where: { tierId: tier.id, status: { in: ACTIVE } },
    select: { userId: true, status: true, user: { select: { email: true, role: true } } },
  });
  if (subscriptions.length) {
    console.log(`${TAG} "${tier.name}" still has ${subscriptions.length} active account(s); not archiving:`);
    for (const row of subscriptions) console.log(`${TAG}   ${row.user?.email || row.userId} (${row.user?.role || "?"}, ${row.status})`);
    console.log(`${TAG} move them to another plan in the admin first, then run this again.`);
    process.exitCode = 1;
    return;
  }

  console.log(`${TAG} "${tier.name}" has no active accounts.`);
  if (!apply) {
    console.log(`${TAG} dry run: would archive it (inactive, not public). Run with --apply to do it.`);
    return;
  }
  await db.$transaction([
    db.subscriptionTier.update({ where: { id: tier.id }, data: { isActive: false, isPublic: false, archivedAt: new Date() } }),
    db.adminAuditLog.create({
      data: {
        action: "tier_archived",
        beforeJson: { id: tier.id, key: tier.key, name: tier.name },
        afterJson: { archived: true },
        reason: "A lab is a vendor, not a subscription tier (17 Oct 2026).",
      },
    }),
  ]);
  console.log(`${TAG} archived "${tier.name}".`);
};

main()
  .catch((error) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
