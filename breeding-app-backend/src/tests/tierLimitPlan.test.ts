import { describe, expect, it } from "vitest";
import { TIER_LIMIT_PLAN, describeTarget, planTierLimitChanges, type TierRow } from "../services/tierLimitPlan";

/**
 * The animal and photo limits per tier (owner's numbers, 16 Oct 2026) and the dry-run/apply plan
 * the live-database script is built on.
 */

const tier = (key: string, features: TierRow["features"] = []): TierRow => ({ id: `tier_${key}`, key, name: key, features });

describe("the plan", () => {
  it("holds the owner's numbers", () => {
    const table = Object.fromEntries(Object.entries(TIER_LIMIT_PLAN).map(([key, features]) => [
      key,
      [describeTarget(features["animals.create"] ?? null), describeTarget(features["animals.photos"] ?? null)],
    ]));
    expect(table).toEqual({
      free: ["10", "3"],
      hobby: ["50", "5"],
      hobby_plus: ["100", "7"],
      breeder: ["250", "9"],
      professional_breeder: ["500", "unlimited"],
      enterprise: ["unlimited", "unlimited"],
      lab_partner: ["(no row)", "off"],
    });
  });
});

describe("planTierLimitChanges", () => {
  it("lists only what differs, with before and after", () => {
    const { changes, unchanged } = planTierLimitChanges([
      tier("free", [
        { featureKey: "animals.create", enabled: true, limitValue: 20 },
        { featureKey: "animals.photos", enabled: true, limitValue: 3 },
      ]),
    ]);
    expect(changes).toEqual([
      expect.objectContaining({ tierKey: "free", featureKey: "animals.create", before: { enabled: true, limit: 20 }, after: { enabled: true, limit: 10 } }),
    ]);
    expect(unchanged).toHaveLength(1);
  });

  it("writes a missing row and switches photos off for the lab", () => {
    const { changes } = planTierLimitChanges([
      tier("lab_partner", [{ featureKey: "animals.photos", enabled: true, limitValue: null }]),
      tier("hobby"),
    ]);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tierKey: "lab_partner", featureKey: "animals.photos", after: { enabled: false, limit: null } }),
      expect.objectContaining({ tierKey: "hobby", featureKey: "animals.create", before: null, after: { enabled: true, limit: 50 } }),
      expect.objectContaining({ tierKey: "hobby", featureKey: "animals.photos", before: null, after: { enabled: true, limit: 5 } }),
    ]));
  });

  it("turns a limit into unlimited for the top tiers", () => {
    const { changes } = planTierLimitChanges([
      tier("enterprise", [{ featureKey: "animals.photos", enabled: true, limitValue: 8 }, { featureKey: "animals.create", enabled: true, limitValue: null }]),
    ]);
    expect(changes).toEqual([expect.objectContaining({ featureKey: "animals.photos", after: { enabled: true, limit: null } })]);
  });

  it("reports tiers the database does not have instead of creating them", () => {
    const { missingTiers, changes } = planTierLimitChanges([]);
    expect(changes).toEqual([]);
    expect(missingTiers).toEqual(Object.keys(TIER_LIMIT_PLAN));
  });

  it("finds nothing to do the second time", () => {
    const applied = Object.entries(TIER_LIMIT_PLAN).map(([key, features]) => tier(key, Object.entries(features).map(([featureKey, target]) => ({
      featureKey,
      enabled: target.enabled,
      limitValue: target.limit,
    }))));
    expect(planTierLimitChanges(applied).changes).toEqual([]);
  });
});
