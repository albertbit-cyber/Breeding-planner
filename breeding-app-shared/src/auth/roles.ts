export const APP_ROLES = [
  "super_admin",
  "admin",
  "breeder",
  "lab_owner",
  "lab_staff",
  "buyer",
  "viewer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const LEGACY_APP_ROLES = ["lab", "moderator", "support"] as const;

export type LegacyAppRole = (typeof LEGACY_APP_ROLES)[number];
export type AnyAppRole = AppRole | LegacyAppRole;

const roleSet = new Set<string>([...APP_ROLES, ...LEGACY_APP_ROLES]);

export const isAppRole = (value: unknown): value is AppRole =>
  typeof value === "string" && APP_ROLES.includes(value as AppRole);

export const isKnownRole = (value: unknown): value is AnyAppRole =>
  typeof value === "string" && roleSet.has(value);

export const normalizeAppRole = (role: AnyAppRole): AppRole => {
  if (role === "lab") {
    return "lab_staff";
  }

  if (role === "moderator" || role === "support") {
    return "admin";
  }

  return role;
};

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  breeder: "Breeder",
  lab_owner: "Lab owner",
  lab_staff: "Lab staff",
  buyer: "Buyer",
  viewer: "Viewer",
};
