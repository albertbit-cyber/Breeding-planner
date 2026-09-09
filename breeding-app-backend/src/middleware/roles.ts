import type { NextFunction, Request, Response } from "express";
import { normalizePersistedRole, isModeratorRole } from "../auth/identity";
import type { AppRole, PersistedAppRole } from "../types/auth";

const ADMIN_FAMILY: readonly AppRole[] = ["super_admin", "admin", "moderator"];

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const expandRole = (role: PersistedAppRole): AppRole[] => {
  if (role === "lab") return ["lab_owner", "lab_staff"];
  if (role === "admin") return [...ADMIN_FAMILY];
  return [normalizePersistedRole(role)];
};

interface RoleGuardOptions {
  /**
   * Opens an admin-power route to moderator writes. Reserved for the handful of
   * endpoints whose entire purpose is letting a moderator raise something to
   * the owner; everything else stays read-only for them.
   */
  moderatorWrite: boolean;
}

const buildGuardForRoles = (allowed: AppRole[], options: RoleGuardOptions) => {

  /**
   * A route is "admin power" when admin roles are the *only* thing it accepts.
   * `requireRole("admin", "breeder")` is not: there the moderator is acting as
   * an ordinary user on their own data, and blocking their writes would break
   * the breeder app for them. Deriving this from the guard itself rather than
   * from where the route happens to be mounted means every admin route that
   * exists today is covered, and so is every one added later — the 17 admin
   * endpoints outside the admin router included.
   */
  const isAdminPowerRoute = allowed.length > 0 && allowed.every((role) => ADMIN_FAMILY.includes(role));

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const role = req.user.role as AppRole;

    if (!allowed.includes(role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    if (
      isAdminPowerRoute &&
      isModeratorRole(role) &&
      !options.moderatorWrite &&
      !READ_METHODS.has(req.method.toUpperCase())
    ) {
      res.status(403).json({
        message: "Moderators have read-only access. Ask the account owner to make this change.",
        code: "moderator_read_only",
      });
      return;
    }

    next();
  };
};

const buildRoleGuard = (roles: PersistedAppRole[], options: RoleGuardOptions) =>
  buildGuardForRoles(Array.from(new Set(roles.flatMap(expandRole))), options);

export const requireRole = (...roles: PersistedAppRole[]) => buildRoleGuard(roles, { moderatorWrite: false });

/**
 * Same gate as `requireRole`, minus the moderator read-only wall. Every use is
 * a deliberate exception and should stay countable on one hand.
 */
export const requireRoleAllowingModeratorWrite = (...roles: PersistedAppRole[]) =>
  buildRoleGuard(roles, { moderatorWrite: true });

/**
 * Owner only. Written without `expandRole` on purpose: `"admin"` expands to the
 * whole admin family, and this guard exists precisely to exclude moderators —
 * outright, not merely on writes.
 */
export const requireOwner = () => buildGuardForRoles(["super_admin", "admin"], { moderatorWrite: false });

export const requireAnyRole = requireRole;
