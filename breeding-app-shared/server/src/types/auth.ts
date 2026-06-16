export type AppRole = "admin" | "lab" | "breeder" | "buyer" | "moderator" | "support";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: AppRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
}
