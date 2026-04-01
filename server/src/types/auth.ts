export type AppRole = "admin" | "lab" | "breeder";

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
