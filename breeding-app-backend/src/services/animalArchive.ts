/**
 * The breeder app's animal archive, as far as the server needs to know it.
 *
 * An archived animal (sold, died, given away, traded, lost) stays in the account with its whole
 * record, but it no longer counts toward the plan's animal limit. The app marks it by status, so
 * the server can tell without reading payloads: these are the statuses the app writes, mirrored
 * from breeding-app-breeder/src/features/animals/archive.js (ARCHIVED_STATUSES). Keep them equal.
 */
export const ARCHIVED_ANIMAL_STATUSES = ["sold", "deceased", "archived"] as const;

// Prisma's `in` is case-sensitive and the column has held hand-typed statuses for years, so
// every casing the app and the older phone build have written is listed.
const ARCHIVED_STATUS_SPELLINGS = ARCHIVED_ANIMAL_STATUSES.flatMap((status) => [
  status,
  status.charAt(0).toUpperCase() + status.slice(1),
  status.toUpperCase(),
]);

export const isArchivedAnimalStatus = (status: unknown): boolean => {
  if (status === undefined || status === null) return false;
  return (ARCHIVED_ANIMAL_STATUSES as readonly string[]).includes(String(status).trim().toLowerCase());
};

/**
 * Prisma `where` for the animals that count toward the limit: not deleted, not archived.
 * A null status is a live animal, and `notIn` alone would drop it (SQL `NULL NOT IN (...)` is
 * not true), hence the OR.
 */
export const countedAnimalWhere = (ownerId: string, extra: Record<string, unknown> = {}) => ({
  ownerId,
  deletedAt: null,
  OR: [{ status: null }, { status: { notIn: ARCHIVED_STATUS_SPELLINGS } }],
  ...extra,
});
