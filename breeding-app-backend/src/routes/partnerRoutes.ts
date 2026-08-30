import { Router } from "express";
import { postPartnerApplication } from "../controllers/partnerController";
import { asyncHandler } from "../middleware/asyncHandler";
import { authRecoveryLimiter } from "../middleware/rateLimiters";

export const partnerRoutes = Router();

/**
 * Unauthenticated, and creates nothing but a lead. Rate limited like a recovery
 * endpoint because it is an unauthenticated write that sends nothing back — the
 * shape an abuser would otherwise hammer.
 */
partnerRoutes.post("/applications", authRecoveryLimiter, asyncHandler(postPartnerApplication));
