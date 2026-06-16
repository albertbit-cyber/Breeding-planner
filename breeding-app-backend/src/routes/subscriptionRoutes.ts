import { Router } from "express";
import {
  accessCheck,
  addOverride,
  adminFeatures,
  adminTiers,
  archiveTier,
  assignSubscription,
  createTier,
  deleteOverride,
  duplicateTier,
  publicTiers,
  resetUsage,
  tierDetail,
  updateTier,
  userSubscription,
} from "../controllers/subscriptionController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const subscriptionRoutes = Router();

subscriptionRoutes.get("/public/tiers", asyncHandler(publicTiers));

subscriptionRoutes.get("/access", requireAuth, asyncHandler(accessCheck));
subscriptionRoutes.get("/access/:featureKey", requireAuth, asyncHandler(accessCheck));

subscriptionRoutes.get("/admin/features", requireAuth, requireRole("admin"), asyncHandler(adminFeatures));
subscriptionRoutes.get("/admin/tiers", requireAuth, requireRole("admin"), asyncHandler(adminTiers));
subscriptionRoutes.post("/admin/tiers", requireAuth, requireRole("admin"), asyncHandler(createTier));
subscriptionRoutes.get("/admin/tiers/:id", requireAuth, requireRole("admin"), asyncHandler(tierDetail));
subscriptionRoutes.patch("/admin/tiers/:id", requireAuth, requireRole("admin"), asyncHandler(updateTier));
subscriptionRoutes.post("/admin/tiers/:id/duplicate", requireAuth, requireRole("admin"), asyncHandler(duplicateTier));
subscriptionRoutes.post("/admin/tiers/:id/archive", requireAuth, requireRole("admin"), asyncHandler(archiveTier));

subscriptionRoutes.get("/admin/users/:id/subscription", requireAuth, requireRole("admin"), asyncHandler(userSubscription));
subscriptionRoutes.patch("/admin/users/:id/subscription", requireAuth, requireRole("admin"), asyncHandler(assignSubscription));
subscriptionRoutes.post("/admin/users/:id/overrides", requireAuth, requireRole("admin"), asyncHandler(addOverride));
subscriptionRoutes.delete("/admin/users/:id/overrides/:overrideId", requireAuth, requireRole("admin"), asyncHandler(deleteOverride));
subscriptionRoutes.post("/admin/users/:id/usage/reset", requireAuth, requireRole("admin"), asyncHandler(resetUsage));
