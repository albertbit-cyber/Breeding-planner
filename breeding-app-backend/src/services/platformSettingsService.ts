import { prisma } from "../lib/prisma";
import type { AuthenticatedUser } from "../types/auth";
import { HttpError } from "../utils/errors";
import { FEATURE_CATALOG, featureAudience } from "./subscriptionCatalog";
import { DEFAULT_TIER_RECOMMENDATIONS, type TierRecommendations } from "./tierRecommendations";

/**
 * The suggestions the owner edits in the admin's Suggestions page. Code holds the defaults and a
 * stored row replaces them, so a fresh database behaves exactly like the defaults and "Reset" is
 * just deleting the row.
 */

const db = prisma as any;

export const TIER_RECOMMENDATIONS_KEY = "tiers.recommendations";
export const PEDIGREE_SHARING_KEY = "pedigree.sharedFields";

/**
 * What another breeder sees of my animals when their extended pedigree passes through my
 * collection. Identity and genetics only: no notes, prices, health or husbandry logs.
 */
export const PEDIGREE_SHAREABLE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "genetics", label: "Morph / genetics" },
  { key: "sex", label: "Sex" },
  { key: "hatchYear", label: "Hatch year" },
  { key: "hatchDate", label: "Full hatch date" },
  { key: "photo", label: "Cover photo" },
  { key: "breederName", label: "Breeder name" },
  { key: "weight", label: "Latest weight" },
] as const;

export const DEFAULT_PEDIGREE_SHARED_FIELDS = ["name", "genetics", "sex", "hatchYear"];

const SHAREABLE_KEYS = new Set<string>(PEDIGREE_SHAREABLE_FIELDS.map((field) => field.key));
const TIER_FEATURE_KEYS = new Set(FEATURE_CATALOG.filter((item) => featureAudience(item.featureKey) === "tier").map((item) => item.featureKey));

const readSetting = async (key: string): Promise<{ value: unknown; updatedAt: Date | null } | null> => {
  const row = await db.platformSetting.findUnique({ where: { key } });
  return row ? { value: row.value, updatedAt: row.updatedAt || null } : null;
};

const writeSetting = async (actor: AuthenticatedUser, key: string, value: unknown) => {
  await db.platformSetting.upsert({
    where: { key },
    update: { value, updatedByUserId: actor.id },
    create: { key, value, updatedByUserId: actor.id },
  });
  await db.adminAuditLog
    .create({ data: { adminUserId: actor.id, action: "platform_setting_updated", afterJson: { key, value }, reason: key } })
    .catch(() => null);
};

const limitOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

/** Keeps only known tier features, as { enabled, limit } entries. Unknown keys are dropped, not kept as noise. */
export const normalizeRecommendations = (input: unknown): TierRecommendations => {
  const result: TierRecommendations = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [tierKey, features] of Object.entries(input as Record<string, unknown>)) {
    const cleanTier = String(tierKey).trim().toLowerCase();
    if (!cleanTier || !features || typeof features !== "object") continue;
    const entries: TierRecommendations[string] = {};
    for (const [featureKey, raw] of Object.entries(features as Record<string, unknown>)) {
      if (!TIER_FEATURE_KEYS.has(featureKey)) continue;
      const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : { enabled: raw };
      entries[featureKey] = { enabled: Boolean(record.enabled), limit: limitOrNull(record.limit) };
    }
    result[cleanTier] = entries;
  }
  return result;
};

export const normalizeSharedFields = (input: unknown): string[] =>
  Array.from(new Set((Array.isArray(input) ? input : []).map((value) => String(value)).filter((key) => SHAREABLE_KEYS.has(key))));

export const getTierRecommendations = async () => {
  const stored = await readSetting(TIER_RECOMMENDATIONS_KEY);
  return {
    recommendations: stored ? normalizeRecommendations(stored.value) : DEFAULT_TIER_RECOMMENDATIONS,
    isDefault: !stored,
    updatedAt: stored?.updatedAt || null,
  };
};

export const getPedigreeSharedFields = async () => {
  const stored = await readSetting(PEDIGREE_SHARING_KEY);
  return {
    fields: stored ? normalizeSharedFields(stored.value) : DEFAULT_PEDIGREE_SHARED_FIELDS,
    options: PEDIGREE_SHAREABLE_FIELDS,
    isDefault: !stored,
    updatedAt: stored?.updatedAt || null,
  };
};

/** Everything the Suggestions page shows, plus the defaults so the page can offer "reset". */
export const getSuggestions = async () => ({
  tierRecommendations: await getTierRecommendations(),
  pedigreeSharing: await getPedigreeSharedFields(),
  defaults: { tierRecommendations: DEFAULT_TIER_RECOMMENDATIONS, pedigreeSharedFields: DEFAULT_PEDIGREE_SHARED_FIELDS },
});

export const updateSuggestions = async (actor: AuthenticatedUser, payload: Record<string, unknown>) => {
  if (actor.role !== "admin") throw new HttpError(403, "Only admins can change suggestions.");
  if (payload.tierRecommendations !== undefined) {
    if (payload.tierRecommendations === null) {
      await db.platformSetting.deleteMany({ where: { key: TIER_RECOMMENDATIONS_KEY } });
    } else {
      await writeSetting(actor, TIER_RECOMMENDATIONS_KEY, normalizeRecommendations(payload.tierRecommendations));
    }
  }
  if (payload.pedigreeSharedFields !== undefined) {
    if (payload.pedigreeSharedFields === null) {
      await db.platformSetting.deleteMany({ where: { key: PEDIGREE_SHARING_KEY } });
    } else {
      await writeSetting(actor, PEDIGREE_SHARING_KEY, normalizeSharedFields(payload.pedigreeSharedFields));
    }
  }
  return getSuggestions();
};
