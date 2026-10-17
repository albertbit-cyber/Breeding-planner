/**
 * The breeder app's animal archive, as far as the server needs to know it.
 *
 * An archived animal (sold, died, given away, traded, lost) stays in the account with its whole
 * record, but it no longer counts toward the plan's animal limit. The app marks it by status, so
 * the server can tell without reading payloads: these are the statuses the app writes, mirrored
 * from breeding-app-breeder/src/features/animals/archive.js (ARCHIVED_STATUSES). Keep them equal.
 */
export const ARCHIVED_ANIMAL_STATUSES = ["sold", "deceased", "archived", "removed"] as const;

/** A deleted snake kept as a small lineage card (status "Removed", payload.removed set). */
export const isRemovedAnimalPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  if (record.removed && typeof record.removed === "object") return true;
  return String(record.status ?? "").trim().toLowerCase() === "removed";
};

// Prisma's `in` is case-sensitive and the column has held hand-typed statuses for years, so
// every casing the app and the older phone build have written is listed.
const ARCHIVED_STATUS_SPELLINGS = ARCHIVED_ANIMAL_STATUSES.flatMap((status) => [
  status,
  status.charAt(0).toUpperCase() + status.slice(1),
  status.toUpperCase(),
]);

/**
 * A joint project's partner record: the other breeder's male, kept read-only in the keeper's
 * account for the breeding card and the pedigree. It is not the keeper's animal, so it does not
 * count toward their limit, but it is not archived either -- it stays in the collection.
 */
export const PARTNER_ANIMAL_STATUS = "Partner";

const UNCOUNTED_STATUS_SPELLINGS = [
  ...ARCHIVED_STATUS_SPELLINGS,
  PARTNER_ANIMAL_STATUS,
  PARTNER_ANIMAL_STATUS.toLowerCase(),
  PARTNER_ANIMAL_STATUS.toUpperCase(),
];

export const isArchivedAnimalStatus = (status: unknown): boolean => {
  if (status === undefined || status === null) return false;
  return (ARCHIVED_ANIMAL_STATUSES as readonly string[]).includes(String(status).trim().toLowerCase());
};

/**
 * Prisma `where` for the animals that count toward the limit: not deleted, not archived, not a
 * partner record.
 * A null status is a live animal, and `notIn` alone would drop it (SQL `NULL NOT IN (...)` is
 * not true), hence the OR.
 */
export const countedAnimalWhere = (ownerId: string, extra: Record<string, unknown> = {}) => ({
  ownerId,
  deletedAt: null,
  OR: [{ status: null }, { status: { notIn: UNCOUNTED_STATUS_SPELLINGS } }],
  ...extra,
});
