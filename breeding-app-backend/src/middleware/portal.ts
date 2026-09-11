import type { NextFunction, Request, Response } from "express";
import { canRoleUsePortal, normalizePortal, portalDisplayName } from "../auth/portals";
import type { AppRole, AuthPortal } from "../types/auth";

/**
 * Binds a route group to the sign-in surface it belongs to. Login already
 * refuses to mint a token for the wrong portal; this is the half that matters
 * when someone skips the login screen and replays a token they legitimately
 * hold for another app. Must run after `requireAuth`.
 */
export const requirePortal = (...portals: AuthPortal[]) => {
  const allowed = new Set<AuthPortal>(portals);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const portal = normalizePortal(req.user.portal);

    if (!allowed.has(portal)) {
      res.status(403).json({
        message: `This session was opened in the ${portalDisplayName(portal)}. Sign in to the ${portals
          .map(portalDisplayName)
          .join(" or ")} to continue.`,
        code: "wrong_portal",
      });
      return;
    }

    // Belt and braces: the role must still belong to this portal. A role can be
    // changed after a token was minted, and the token would otherwise keep
    // working for its full lifetime.
    if (!canRoleUsePortal(req.user.role as AppRole, portal)) {
      res.status(403).json({ message: "Forbidden", code: "wrong_portal" });
      return;
    }

    next();
  };
};
