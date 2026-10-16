/**
 * The tier editor's form, in the shape the backend speaks (subscriptionService.ts).
 *
 * Both tier screens used to send `price`, `interval`, `displayName` and a feature `limit`, none of
 * which the backend reads. The worst of it: every feature row went up without `limitValue`, which
 * the backend stores as "unlimited", so saving any tier wiped every limit on it. They also showed a
 * limit box only for `hasLimit`, a field that never existed, so no limit could be set at all.
 *
 * Pure, so the round trip can be tested without rendering.
 */

export const ANIMALS_FEATURE = "animals.create";
export const PHOTOS_FEATURE = "animals.photos";

/** The technical cap on photos per animal, as the backend's PHOTO_MAX_PER_ANIMAL default. */
export const MAX_PHOTOS_PER_ANIMAL = 60;

export const EMPTY_TIER_FORM = {
  name: "",
  key: "",
  shortDescription: "",
  longDescription: "",
  badgeText: "",
  monthlyPrice: "0",
  yearlyPrice: "0",
  currency: "EUR",
  trialDays: "0",
  isActive: true,
  isPublic: true,
  isRecommended: false,
  sortOrder: "0",
};

const text = (value) => (value === null || value === undefined ? "" : String(value));

export function tierToForm(tier) {
  if (!tier) return { ...EMPTY_TIER_FORM };
  return {
    name: text(tier.name),
    key: text(tier.key),
    shortDescription: text(tier.shortDescription),
    longDescription: text(tier.longDescription),
    badgeText: text(tier.badgeText),
    monthlyPrice: text(tier.monthlyPrice ?? 0),
    yearlyPrice: text(tier.yearlyPrice ?? 0),
    currency: text(tier.currency || "EUR"),
    trialDays: text(tier.trialDays ?? 0),
    isActive: tier.isActive !== false,
    isPublic: tier.isPublic !== false,
    isRecommended: Boolean(tier.isRecommended),
    sortOrder: text(tier.sortOrder ?? 0),
  };
}

/** `{ [featureKey]: { enabled, limit } }`, where limit is the input's text ("" = unlimited). */
export function featuresToMap(features) {
  const map = {};
  (Array.isArray(features) ? features : []).forEach((entry) => {
    if (!entry?.featureKey) return;
    map[entry.featureKey] = {
      enabled: Boolean(entry.enabled),
      limit: entry.limitValue === null || entry.limitValue === undefined ? "" : String(entry.limitValue),
    };
  });
  return map;
}

const limitValueOf = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return null;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
};

const number = (raw) => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function formToPayload(form, featureMap) {
  return {
    name: String(form.name || "").trim(),
    key: String(form.key || "").trim() || undefined,
    shortDescription: form.shortDescription,
    longDescription: form.longDescription,
    badgeText: form.badgeText,
    monthlyPrice: number(form.monthlyPrice),
    yearlyPrice: number(form.yearlyPrice),
    currency: String(form.currency || "EUR").trim().toUpperCase(),
    trialDays: number(form.trialDays),
    isActive: Boolean(form.isActive),
    isPublic: Boolean(form.isPublic),
    isRecommended: Boolean(form.isRecommended),
    sortOrder: number(form.sortOrder),
    features: Object.entries(featureMap || {}).map(([featureKey, entry]) => ({
      featureKey,
      enabled: Boolean(entry?.enabled),
      limitValue: limitValueOf(entry?.limit),
    })),
  };
}

/** A feature the backend counts against a number (the catalogue's defaultLimitType). */
export const hasLimit = (feature) => feature?.defaultLimitType === "count";

/**
 * The line under the animals-and-photos boxes: what the numbers mean for one account.
 * "Up to 10 animals, 3 photos each: at most 30 photos."
 */
export function describeAnimalPhotoLimits(featureMap) {
  const animals = featureMap?.[ANIMALS_FEATURE];
  const photos = featureMap?.[PHOTOS_FEATURE];
  const animalLimit = animals?.enabled ? limitValueOf(animals.limit) : 0;
  const photoLimit = photos?.enabled ? limitValueOf(photos.limit) : 0;
  const perAnimal = photoLimit === null ? MAX_PHOTOS_PER_ANIMAL : Math.min(photoLimit, MAX_PHOTOS_PER_ANIMAL);

  if (!animals?.enabled) return "Animals are switched off for this tier, so it holds no animals and no photos.";
  const animalsText = animalLimit === null ? "Unlimited animals" : `Up to ${animalLimit} animal${animalLimit === 1 ? "" : "s"}`;
  if (!photos?.enabled || photoLimit === 0) return `${animalsText}, no photos.`;
  const photosText = photoLimit === null
    ? `up to ${MAX_PHOTOS_PER_ANIMAL} photos each (no tier limit, the technical cap)`
    : `${perAnimal} photo${perAnimal === 1 ? "" : "s"} each`;
  if (animalLimit === null) return `${animalsText}, ${photosText}.`;
  return `${animalsText}, ${photosText}: at most ${animalLimit * perAnimal} photos.`;
}
