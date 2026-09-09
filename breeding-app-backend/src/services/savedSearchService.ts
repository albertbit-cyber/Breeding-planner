import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import type { AppRole } from "../types/auth";

type SearchInput = {
  name?: unknown;
  filters?: unknown;
};

type JsonRecord = Record<string, unknown>;

const db = prisma as any;

const textValue = (value: unknown, maxLength = 500): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
};

const asRecord = (value: unknown): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
};

/**
 * The marketplace's real filter set. This used to keep only four keys, so a
 * saved search silently dropped everything the browse page could actually
 * filter on -- genes above all, which is what people search for here.
 */
const SAVED_FILTER_KEYS: Array<[string, number]> = [
  ["search", 160],
  ["species", 120],
  ["sex", 40],
  ["category", 120],
  ["country", 160],
  ["location", 160],
  ["includeGenes", 400],
  ["excludeGenes", 400],
  ["minPrice", 40],
  ["maxPrice", 40],
  ["minWeight", 40],
  ["maxWeight", 40],
  ["minProvenance", 8],
  ["shippingAvailable", 8],
  ["pickupAvailable", 8],
  ["verifiedOnly", 8],
  ["availability", 40],
  ["sort", 40],
];

const sanitizeFilters = (value: unknown): JsonRecord => {
  const input = asRecord(value);
  const out: JsonRecord = {};
  SAVED_FILTER_KEYS.forEach(([key, max]) => {
    const value = textValue(input[key], max);
    // Only keep what was actually set. Storing eighteen empty strings per saved
    // search would bloat the JSON and make two identical searches compare unequal.
    if (value) out[key] = value;
  });
  return out;
};

const toPublicSavedSearch = (row: any) => ({
  id: row.id,
  name: row.name,
  filters: asRecord(row.filters),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const listMySavedSearches = async (actor: { id: string; role: AppRole }) => {
  const rows = await db.savedSearch.findMany({
    where: { ownerId: actor.id },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(toPublicSavedSearch);
};

export const saveMarketplaceSearch = async (
  actor: { id: string; role: AppRole },
  input: SearchInput
) => {
  const name = textValue(input?.name, 120);
  if (!name) throw new HttpError(400, "Saved search name is required.");

  const filters = sanitizeFilters(input?.filters);
  const hasFilters = Object.values(filters).some((value) => String(value || "").trim());
  if (!hasFilters) throw new HttpError(400, "At least one marketplace filter is required.");

  const row = await db.savedSearch.create({
    data: {
      ownerId: actor.id,
      name,
      filters,
    },
  });

  return toPublicSavedSearch(row);
};

export const deleteMarketplaceSearch = async (
  actor: { id: string; role: AppRole },
  searchId: string
) => {
  const id = textValue(searchId, 160);
  if (!id) throw new HttpError(400, "Saved search id is required.");

  const existing = await db.savedSearch.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Saved search not found.");
  if (existing.ownerId !== actor.id && actor.role !== "admin") {
    throw new HttpError(403, "You can only delete your own saved searches.");
  }

  await db.savedSearch.delete({ where: { id } });
  return { id };
};
