import type { NextFunction, Request, Response } from "express";
import type { OrgRole } from "@prisma/client";
import { findMembershipForUser } from "../services/organizationService";
import { isAdminActor } from "../services/permissionHelpers";

/**
 * Tenancy middleware (implementation plan §3.4).
 *
 * `requireRole` answers "what kind of user is this platform-wide". These answer
 * "which tenant is this request acting inside, and may they do this there" —
 * the question that actually keeps one vendor lab out of another's data.
 *
 * Ordering matters: both must run after `requireAuth`, and `requireOrgRole`
 * expects `withOrgContext` to have already loaded the membership.
 */

/**
 * Loads the actor's organization onto the request. Never rejects: routes that
 * are merely org-*aware* (a platform admin listing every lab, say) need the
 * lookup without the gate.
 */
export const withOrgContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  req.membership = await findMembershipForUser(req.user.id);
  next();
};

/**
 * Requires the actor to hold one of the given roles *inside their own
 * organization*.
 *
 * Platform admins pass without a membership, deliberately and in exactly one
 * direction: it lets the admin console read any tenant. It does not hand them
 * write access — the routes an admin must not mutate (a vendor's settings,
 * staff, tests or prices) are not mounted for admins at all, rather than
 * relying on a role check here to hold the line.
 */
export const requireOrgRole = (...roles: OrgRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    if (isAdminActor(req.user)) {
      next();
      return;
    }
    const membership = req.membership;
    if (!membership) {
      res.status(403).json({ message: "This account does not belong to an organization." });
      return;
    }
    if (membership.organization.status === "suspended") {
      // Distinct from the 403 above on purpose: the tenant exists and the actor
      // belongs to it, an admin has switched it off. Different message for the
      // user, different thing to alert on.
      res.status(403).json({ message: "This organization has been suspended." });
      return;
    }
    if (roles.length && !roles.includes(membership.role)) {
      res.status(403).json({ message: "Your role in this organization does not allow this action." });
      return;
    }
    next();
  };
};

/** Convenience for the common "any active member of the org" gate. */
export const requireOrgMember = requireOrgRole();

/** Owner or admin — the roles that may change the organization itself. */
export const requireOrgAdmin = requireOrgRole("owner", "admin");
