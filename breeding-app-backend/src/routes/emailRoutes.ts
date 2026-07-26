import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getMyEmailHistoryHandler, getMyEmailPreferences, putMyEmailPreference } from "../controllers/emailController";

export const emailRoutes = Router();

emailRoutes.use(requireAuth);
emailRoutes.get("/history", asyncHandler(getMyEmailHistoryHandler));
emailRoutes.get("/preferences", asyncHandler(getMyEmailPreferences));
emailRoutes.put("/preferences/:category", asyncHandler(putMyEmailPreference));
