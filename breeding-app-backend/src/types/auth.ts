export type AppRole =
  | "super_admin"
  | "admin"
  | "moderator"
  | "breeder"
  | "lab_owner"
  | "lab_staff"
  | "buyer"
  | "viewer";

export type PersistedAppRole = AppRole | "lab" | "support";

/**
 * The four sign-in surfaces. A portal is *where* someone signed in, which is
 * deliberately separate from *what* they may do once inside: the role still
 * decides that. Staff reach every portal; a breeder, buyer or laboratory
 * reaches only its own, so the admin console can never be opened with a
 * breeder's password (see auth/portals.ts).
 */
export type AuthPortal = "breeder" | "lab" | "admin" | "marketplace";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: AppRole;
  persistedRole?: PersistedAppRole;
  /**
   * Absent on tokens minted before portals existed. Everything that reads this
   * treats a missing value as the least privileged portal rather than as a
   * wildcard, so an old token cannot be replayed against the admin API.
   */
  portal?: AuthPortal;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
  persistedRole?: PersistedAppRole;
  portal?: AuthPortal;
}
