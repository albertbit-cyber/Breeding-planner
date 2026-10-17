import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG, featureAudience } from "../services/subscriptionCatalog";
import { DEFAULT_TIER_RECOMMENDATIONS } from "../services/tierRecommendations";
import { DEFAULT_PEDIGREE_SHARED_FIELDS, normalizeRecommendations, normalizeSharedFields } from "../services/platformSettingsService";

/** The owner's brief for the tiers (17 Oct 2026), held against the recommended feature sets. */

const on = (tier: string, key: string) => Boolean(DEFAULT_TIER_RECOMMENDATIONS[tier]?.[key]?.enabled);
const count = (tier: string) => Object.values(DEFAULT_TIER_RECOMMENDATIONS[tier]).filter((value) => value.enabled).length;
const limit = (tier: string, key: string) => DEFAULT_TIER_RECOMMENDATIONS[tier]?.[key]?.limit;

describe("recommended tiers", () => {
  it("has no lab tier: a lab is a vendor", () => {
    expect(Object.keys(DEFAULT_TIER_RECOMMENDATIONS)).not.toContain("lab_partner");
    for (const features of Object.values(DEFAULT_TIER_RECOMMENDATIONS)) {
      expect(features["lab.portal"]).toBeUndefined();
      expect(features["admin.users"]).toBeUndefined();
    }
  });

  it("holds the animal caps: Free 10, Hobby Keeper 25", () => {
    expect(limit("free", "animals.create")).toBe(10);
    expect(limit("hobby", "animals.create")).toBe(25);
  });

  it("gives Hobby Keeper fewer breeding tools and Hobby Breeder the full season", () => {
    for (const key of ["breeding.lock_tracking", "breeding.ovulation_tracking", "breeding.egg_tracking"]) {
      expect(on("hobby", key)).toBe(false);
      expect(on("hobby_plus", key)).toBe(true);
    }
  });

  it("keeps the extended pedigree for Breeder and up; the lower tiers get their own", () => {
    for (const tier of ["free", "hobby", "hobby_plus", "custom"]) {
      expect(on(tier, "pedigree.family_tree")).toBe(true);
      expect(on(tier, "pedigree.extended")).toBe(false);
    }
    for (const tier of ["breeder", "professional_breeder", "enterprise"]) {
      expect(on(tier, "pedigree.extended")).toBe(true);
    }
  });

  it("gives every breeding and pedigree feature to Breeder and Professional Breeder", () => {
    const breeding = FEATURE_CATALOG.filter((item) => /^(breeding|pedigree|genetics)\./.test(item.featureKey));
    for (const item of breeding) {
      expect(on("breeder", item.featureKey)).toBe(true);
      expect(on("professional_breeder", item.featureKey)).toBe(true);
    }
  });

  it("gives Enterprise everything a customer can have, unlimited", () => {
    const customerFeatures = FEATURE_CATALOG.filter((item) => featureAudience(item.featureKey) === "tier");
    expect(count("enterprise")).toBe(customerFeatures.length);
    expect(Object.values(DEFAULT_TIER_RECOMMENDATIONS.enterprise).every((value) => value.limit === null)).toBe(true);
  });

  it("grows tier by tier; Enterprise differs from Professional Breeder by limits, not features", () => {
    const order = ["free", "hobby", "hobby_plus", "breeder", "professional_breeder"];
    for (let index = 1; index < order.length; index += 1) {
      expect(count(order[index])).toBeGreaterThan(count(order[index - 1]));
    }
    expect(count("enterprise")).toBe(count("professional_breeder"));
    expect(limit("professional_breeder", "animals.create")).toBe(500);
    expect(limit("enterprise", "animals.create")).toBeNull();
  });
});

describe("saving suggestions", () => {
  it("keeps known customer features and drops staff, vendor and unknown keys", () => {
    const result = normalizeRecommendations({
      Hobby: { "animals.create": { enabled: true, limit: "30" }, "lab.portal": { enabled: true }, "nope.key": { enabled: true } },
    });
    expect(result).toEqual({ hobby: { "animals.create": { enabled: true, limit: 30 } } });
  });

  it("keeps only shareable pedigree fields, defaulting to identity and genetics", () => {
    expect(DEFAULT_PEDIGREE_SHARED_FIELDS).toEqual(["name", "genetics", "sex", "hatchYear"]);
    expect(normalizeSharedFields(["name", "price", "notes", "sex", "sex"])).toEqual(["name", "sex"]);
  });
});
