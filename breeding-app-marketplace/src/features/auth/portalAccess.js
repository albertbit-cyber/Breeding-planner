/**
 * Which roles belong in this app.
 *
 * The backend refuses to mint a token for the wrong portal, so this file is not
 * the security boundary — it is what stops the app from *rendering* for someone
 * the API will refuse. Without it, signing in to the admin console with breeder
 * credentials produced the console shell with every panel empty, which reads as
 * a broken admin page rather than as a closed door.
 *
 * A copy of this lives in each app because the four frontends have diverged and
 * share no build. Keep them identical; the map below is the same in all four.
 */

/** Mirrors the backend's normalizePersistedRole: what is stored vs. what it means. */
export const normalizeRole = (role) => {
  const value = String(role || "").trim().toLowerCase();
  if (value === "lab") return "lab_staff";
  if (value === "support") return "moderator";
  return value;
};

const STAFF_ROLES = new Set(["super_admin", "admin", "moderator"]);

/** Staff oversee every portal; everyone else is confined to their own. */
const PORTAL_TENANT_ROLES = {
  admin: [],
  lab: ["lab_owner", "lab_staff"],
  breeder: ["breeder"],
  marketplace: ["breeder", "buyer"],
};

export const isStaffRole = (role) => STAFF_ROLES.has(normalizeRole(role));

export const canRoleUsePortal = (role, portal) => {
  const normalized = normalizeRole(role);
  if (STAFF_ROLES.has(normalized)) return true;
  return (PORTAL_TENANT_ROLES[portal] || []).includes(normalized);
};

/**
 * Names the door the account *does* open. Someone who lands on the wrong URL
 * needs to be told where to go, and their own role is not a secret from them.
 */
export const portalRejectionMessage = (role, portal) => {
  const normalized = normalizeRole(role);
  if (portal === "admin") {
    return "This is the admin console. Your account doesn't have access to it — sign in to the breeder app instead.";
  }
  if (portal === "lab") {
    return "This is the Laboratory portal. Your account doesn't have access to it — sign in to the breeder app instead.";
  }
  if (normalized === "lab_owner" || normalized === "lab_staff") {
    return "This is a laboratory account. Sign in to the Laboratory portal instead.";
  }
  return "Your account doesn't have access to this app.";
};
