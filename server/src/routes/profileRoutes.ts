import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getCurrentProfile, getMarketplaceProfiles, putCurrentProfile } from "../controllers/profileController";

export const profileRoutes = Router();

profileRoutes.get("/me", requireAuth, asyncHandler(getCurrentProfile));
profileRoutes.put("/me", requireAuth, asyncHandler(putCurrentProfile));
profileRoutes.get("/marketplace", requireAuth, asyncHandler(getMarketplaceProfiles));
