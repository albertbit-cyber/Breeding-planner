import type { AppRole, PersistedAppRole } from "../types/auth";

/**
 * Maps what the database stores onto what the code reasons about.
 *
 * `support` folds into `moderator`: they were two names for one job, and
 * `support` used to normalize to `admin`, which silently handed every support
 * account the full admin key. The value stays in the Prisma enum — dropping an
 * enum value in Postgres means swapping the column's type, which is real
 * downtime for no gain — but nothing assigns it any more, and any row still
 * holding it reads as a read-only moderator.
 */
export const normalizePersistedRole = (role: PersistedAppRole): AppRole => {
  if (role === "lab") {
    return "lab_staff";
  }

  if (role === "support") {
    return "moderator";
  }

  return role;
};

/**
 * Full administrative power. `super_admin` is a code-level name for the owner
 * and is never persisted — the owner's row holds `admin`, which no API can
 * mint a second copy of (see adminService.createAdminUser), so the owner
 * account stays singular by construction rather than by convention.
 */
export const isOwnerRole = (role: AppRole): boolean => role === "super_admin" || role === "admin";

/** Read-only oversight: may open the admin console, may not change anything in it. */
export const isModeratorRole = (role: AppRole): boolean => role === "moderator";

/** Anyone who belongs to the house — owner or moderator. Staff reach every portal. */
export const isStaffRole = (role: AppRole): boolean => isOwnerRole(role) || isModeratorRole(role);

/** Retained for existing call sites that mean "may act with admin authority". */
export const isAdminRole = (role: AppRole): boolean => isOwnerRole(role);

export const isBreederRole = (role: AppRole): boolean => isStaffRole(role) || role === "breeder";

export const isLabRole = (role: AppRole): boolean =>
  isStaffRole(role) || role === "lab_owner" || role === "lab_staff";
