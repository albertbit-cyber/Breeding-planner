import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { marketplaceMutationLimiter } from "../middleware/rateLimiters";
import {
  getMarketplaceListings,
  getModerationAudit,
  getModerationListings,
  getMyListings,
  patchListingStatus,
  putMyListings,
} from "../controllers/listingController";

export const listingRoutes = Router();

listingRoutes.get("/me", requireAuth, asyncHandler(getMyListings));
listingRoutes.put("/me", marketplaceMutationLimiter, requireAuth, asyncHandler(putMyListings));
listingRoutes.get("/marketplace", asyncHandler(getMarketplaceListings));
listingRoutes.get("/moderation/audit", requireAuth, asyncHandler(getModerationAudit));
listingRoutes.get("/moderation", requireAuth, asyncHandler(getModerationListings));
listingRoutes.patch("/:id/status", marketplaceMutationLimiter, requireAuth, asyncHandler(patchListingStatus));
