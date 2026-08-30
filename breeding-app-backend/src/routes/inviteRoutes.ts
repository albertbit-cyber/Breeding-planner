import { Router } from "express";
import { getInvite, postInviteAcceptance } from "../controllers/inviteController";
import { asyncHandler } from "../middleware/asyncHandler";
import { authWriteLimiter, authRecoveryLimiter } from "../middleware/rateLimiters";

export const inviteRoutes = Router();

/**
 * Unauthenticated by design: an invitation is what an invitee has *instead of*
 * an account. Both routes are rate limited, because the token in the URL is the
 * only thing standing between an attacker and a tenant — the preview is limited
 * like a recovery lookup, and acceptance like any other credential-creating write.
 */
inviteRoutes.get("/:token", authRecoveryLimiter, asyncHandler(getInvite));
inviteRoutes.post("/:token/accept", authWriteLimiter, asyncHandler(postInviteAcceptance));
