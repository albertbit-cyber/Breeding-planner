import { describe, expect, it } from "vitest";
import { describeAnimalPhotoLimits, featuresToMap, formToPayload, hasLimit, tierToForm } from "./tierForm";

// A tier as GET /subscriptions/admin/tiers returns it (subscriptionService.normalizeTier).
const FREE = {
  id: "tier_free",
  key: "free",
  name: "Free",
  shortDescription: "Basic records for small collections.",
  monthlyPrice: 0,
  yearlyPrice: 0,
  currency: "EUR",
  trialDays: 0,
  isActive: true,
  isPublic: true,
  isRecommended: false,
  sortOrder: 1,
  features: [
    { featureKey: "animals.create", enabled: true, limitValue: 10 },
    { featureKey: "animals.photos", enabled: true, limitValue: 3 },
    { featureKey: "marketplace.create_listing", enabled: false, limitValue: 0 },
    { featureKey: "animals.notes", enabled: true, limitValue: null },
  ],
};

describe("tier form round trip", () => {
  it("sends every limit back as limitValue, so saving keeps them", () => {
    const payload = formToPayload(tierToForm(FREE), featuresToMap(FREE.features));
    expect(payload.features).toEqual([
      { featureKey: "animals.create", enabled: true, limitValue: 10 },
      { featureKey: "animals.photos", enabled: true, limitValue: 3 },
      { featureKey: "marketplace.create_listing", enabled: false, limitValue: 0 },
      { featureKey: "animals.notes", enabled: true, limitValue: null },
    ]);
  });

  it("speaks the backend's field names", () => {
    const payload = formToPayload({ ...tierToForm(FREE), monthlyPrice: "9", yearlyPrice: "90" }, {});
    expect(payload).toMatchObject({ name: "Free", key: "free", monthlyPrice: 9, yearlyPrice: 90, currency: "EUR", sortOrder: 1, isActive: true, isPublic: true });
    expect(payload).not.toHaveProperty("price");
    expect(payload).not.toHaveProperty("interval");
  });

  it("reads a blank box as unlimited", () => {
    const payload = formToPayload(tierToForm(FREE), { "animals.photos": { enabled: true, limit: "" } });
    expect(payload.features).toEqual([{ featureKey: "animals.photos", enabled: true, limitValue: null }]);
  });

  it("shows a limit box for counted features only", () => {
    expect(hasLimit({ defaultLimitType: "count" })).toBe(true);
    expect(hasLimit({ defaultLimitType: null })).toBe(false);
  });
});

describe("describeAnimalPhotoLimits", () => {
  const map = (animals, photos, animalsOn = true, photosOn = true) => ({
    "animals.create": { enabled: animalsOn, limit: animals },
    "animals.photos": { enabled: photosOn, limit: photos },
  });

  it("multiplies out what one account can hold", () => {
    expect(describeAnimalPhotoLimits(map("10", "3"))).toBe("Up to 10 animals, 3 photos each: at most 30 photos.");
    expect(describeAnimalPhotoLimits(map("250", "9"))).toBe("Up to 250 animals, 9 photos each: at most 2250 photos.");
  });

  it("names the technical cap for unlimited photos", () => {
    expect(describeAnimalPhotoLimits(map("500", ""))).toBe("Up to 500 animals, up to 60 photos each (no tier limit, the technical cap): at most 30000 photos.");
    expect(describeAnimalPhotoLimits(map("", ""))).toBe("Unlimited animals, up to 60 photos each (no tier limit, the technical cap).");
  });

  it("says when photos or animals are off", () => {
    expect(describeAnimalPhotoLimits(map("10", "", true, false))).toBe("Up to 10 animals, no photos.");
    expect(describeAnimalPhotoLimits({})).toBe("Animals are switched off for this tier, so it holds no animals and no photos.");
  });
});
