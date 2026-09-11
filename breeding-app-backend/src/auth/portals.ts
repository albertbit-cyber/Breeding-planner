import type { AppRole, AuthPortal } from "../types/auth";
import { isStaffRole } from "./identity";

export const AUTH_PORTALS: readonly AuthPortal[] = ["breeder", "lab", "admin", "marketplace"] as const;

/**
 * A token that never said which portal it was minted for is treated as
 * `breeder` — the least privileged surface — so tokens issued before portals
 * existed expire out of the admin console instead of grandfathering their way
 * into it. The visible cost is that staff signed in when this shipped have to
 * sign in again.
 */
export const FALLBACK_PORTAL: AuthPortal = "breeder";

export const isAuthPortal = (value: unknown): value is AuthPortal =>
  AUTH_PORTALS.includes(String(value || "") as AuthPortal);

export const normalizePortal = (value: unknown): AuthPortal =>
  isAuthPortal(value) ? value : FALLBACK_PORTAL;

/** Roles that belong to each portal *before* the staff override is applied. */
const PORTAL_TENANT_ROLES: Record<AuthPortal, readonly AppRole[]> = {
  admin: [],
  lab: ["lab_owner", "lab_staff"],
  breeder: ["breeder"],
  marketplace: ["breeder", "buyer"],
};

/**
 * Whether a role may sign in at a portal at all. Staff pass everywhere by
 * design — the owner and moderators oversee the laboratory and marketplace as
 * well as the console. Everyone else is confined to their own surface, which
 * is what stops a breeder's password from opening the admin app.
 */
export const canRoleUsePortal = (role: AppRole, portal: AuthPortal): boolean => {
  if (isStaffRole(role)) return true;
  return PORTAL_TENANT_ROLES[portal].includes(role);
};

export const portalDisplayName = (portal: AuthPortal): string => {
  switch (portal) {
    case "admin":
      return "admin console";
    case "lab":
      return "Laboratory portal";
    case "marketplace":
      return "marketplace";
    default:
      return "breeder app";
  }
};

/**
 * Deliberately says which door the account *does* open rather than only which
 * one it doesn't: someone who lands on the wrong URL needs the right one, and
 * the role is not a secret from the person who owns it.
 */
export const portalRejectionMessage = (role: AppRole, portal: AuthPortal): string => {
  const target = portalDisplayName(portal);
  if (role === "lab_owner" || role === "lab_staff") {
    return `This account is a laboratory account and cannot sign in to the ${target}. Use the Laboratory portal instead.`;
  }
  if (role === "buyer") {
    return `This account is a marketplace account and cannot sign in to the ${target}.`;
  }
  return `This account does not have access to the ${target}. Use the breeder app instead.`;
};
