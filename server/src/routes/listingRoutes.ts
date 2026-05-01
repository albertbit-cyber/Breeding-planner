import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getMarketplaceListings, getMyListings, putMyListings } from "../controllers/listingController";

export const listingRoutes = Router();

listingRoutes.get("/me", requireAuth, asyncHandler(getMyListings));
listingRoutes.put("/me", requireAuth, asyncHandler(putMyListings));
listingRoutes.get("/marketplace", requireAuth, asyncHandler(getMarketplaceListings));
