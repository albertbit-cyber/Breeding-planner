import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The paywall that sold nothing.
 *
 * `canAccessFeature` denies a feature whenever the user's tier does not grant
 * it -- including when the user has no tier because the tier catalogue was
 * never seeded. On such a database every gated feature failed closed, so a
 * breeder could mark a snake for sale, press publish, and be refused with
 * "Feature is not included in the current tier" by a subscription system that
 * did not exist. Marketplace publishing was blocked this way on both the old
 * and the new code path.
 */

vi.mock("../lib/prisma", () => ({
  prisma: {
    userFeatureOverride: { findFirst: vi.fn() },
    userSubscription: { findFirst: vi.fn() },
    subscriptionTier: { findFirst: vi.fn(), count: vi.fn() },
    usageTracking: { findUnique: vi.fn(), create: vi.fn() },
    animal: { count: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import { canAccessFeature } from "../services/subscriptionService";

const db = prisma as any;
const breeder = { id: "breeder-1", role: "breeder" };

beforeEach(() => {
  vi.clearAllMocks();
  db.userFeatureOverride.findFirst.mockResolvedValue(null);
  db.userSubscription.findFirst.mockResolvedValue(null);
  db.subscriptionTier.findFirst.mockResolvedValue(null);
  db.usageTracking.findUnique.mockResolvedValue(null);
  db.usageTracking.create.mockResolvedValue({});
  db.animal.count.mockResolvedValue(0);
});

describe("feature gate on a database with no tier catalogue", () => {
  it("lets a breeder publish to the marketplace when no tiers are configured", async () => {
    db.subscriptionTier.count.mockResolvedValue(0);

    const access = await canAccessFeature(breeder, "marketplace.create_listing");

    expect(access.allowed).toBe(true);
    expect(access.source).toBe("unconfigured");
  });

  it("counts only tiers that are live, ignoring archived and inactive ones", async () => {
    db.subscriptionTier.count.mockResolvedValue(0);
    await canAccessFeature(breeder, "marketplace.create_listing");

    expect(db.subscriptionTier.count).toHaveBeenCalledWith({
      where: { isActive: true, archivedAt: null },
    });
  });

  /** The whole point of the gate must survive on a deployment that does sell tiers. */
  it("still denies an un-subscribed user once a tier catalogue exists", async () => {
    db.subscriptionTier.count.mockResolvedValue(3);
    db.subscriptionTier.findFirst.mockResolvedValue({ name: "Pro" });

    const access = await canAccessFeature(breeder, "marketplace.create_listing");

    expect(access.allowed).toBe(false);
    expect(access.requiredTier).toBe("Pro");
  });

  it("still denies a feature the user's own tier does not grant", async () => {
    db.subscriptionTier.count.mockResolvedValue(3);
    db.subscriptionTier.findFirst.mockResolvedValue({ name: "Pro" });
    db.userSubscription.findFirst.mockResolvedValue({
      tier: { name: "Starter", features: [{ featureKey: "marketplace.view", enabled: true }] },
    });

    const access = await canAccessFeature(breeder, "marketplace.create_listing");

    expect(access.allowed).toBe(false);
    expect(access.currentTier).toBe("Starter");
  });

  /** An admin switching a feature off by hand must not be undone by an empty catalogue. */
  it("respects an explicit admin override even with no tiers configured", async () => {
    db.subscriptionTier.count.mockResolvedValue(0);
    db.userFeatureOverride.findFirst.mockResolvedValue({ enabled: false, limitOverride: null });

    const access = await canAccessFeature(breeder, "marketplace.create_listing");

    expect(access.allowed).toBe(false);
    expect(access.source).toBe("override");
  });
});
