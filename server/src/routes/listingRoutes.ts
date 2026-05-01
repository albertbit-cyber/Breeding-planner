import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import {
  getMarketplaceListings,
  getModerationListings,
  getMyListings,
  patchListingStatus,
  putMyListings,
} from "../controllers/listingController";

export const listingRoutes = Router();

listingRoutes.get("/me", requireAuth, asyncHandler(getMyListings));
listingRoutes.put("/me", requireAuth, asyncHandler(putMyListings));
listingRoutes.get("/marketplace", requireAuth, asyncHandler(getMarketplaceListings));
listingRoutes.get("/moderation", requireAuth, asyncHandler(getModerationListings));
listingRoutes.patch("/:id/status", requireAuth, asyncHandler(patchListingStatus));
