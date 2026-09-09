import { Router } from "express";
import { reportAction } from "../controllers/adminController";
import {
  createEscalation,
  listEscalations,
  reviewEscalation,
} from "../controllers/adminEscalationController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requirePortal } from "../middleware/portal";
import { requireRole, requireRoleAllowingModeratorWrite } from "../middleware/roles";

/**
 * The admin console's deliberate exceptions to "moderators are read-only".
 *
 * Mounted at /api/admin *ahead of* adminRoutes, whose blanket guard is
 * unconditional. Keeping the exceptions in their own file, rather than as an
 * ordering trick inside that router, is what stops a route added later from
 * landing on the permissive side of a mid-router guard by accident: over there
 * the wall is the default, and every hole in it is here, countable.
 *
 * Both writes below are inert by design. Neither changes an account, a listing
 * or a decision; they put something in front of the owner and stop.
 */
export const adminModeratorRoutes = Router();

adminModeratorRoutes.use(requireAuth, requirePortal("admin"));

adminModeratorRoutes.get(
  "/escalations",
  requireRole("admin"),
  asyncHandler(listEscalations)
);

adminModeratorRoutes.post(
  "/escalations",
  requireRoleAllowingModeratorWrite("admin"),
  asyncHandler(createEscalation)
);

// Acting on one is the owner's call; the service enforces that too.
adminModeratorRoutes.patch(
  "/escalations/:id",
  requireRole("admin"),
  asyncHandler(reviewEscalation)
);

// A moderator may escalate a report and nothing else — applyAdminReportAction
// rejects the other five actions for them.
adminModeratorRoutes.post(
  "/reports/:id/action",
  requireRoleAllowingModeratorWrite("admin"),
  asyncHandler(reportAction)
);
