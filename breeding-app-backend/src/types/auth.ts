export type AppRole =
  | "super_admin"
  | "admin"
  | "breeder"
  | "lab_owner"
  | "lab_staff"
  | "buyer"
  | "viewer";

export type PersistedAppRole = AppRole | "lab" | "moderator" | "support";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: AppRole;
  persistedRole?: PersistedAppRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
  persistedRole?: PersistedAppRole;
}
