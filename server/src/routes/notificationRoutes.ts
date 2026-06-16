import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { getMyNotifications, patchNotificationRead } from "../controllers/notificationController";

export const notificationRoutes = Router();

notificationRoutes.get("/", requireAuth, asyncHandler(getMyNotifications));
notificationRoutes.patch("/:id/read", requireAuth, asyncHandler(patchNotificationRead));
