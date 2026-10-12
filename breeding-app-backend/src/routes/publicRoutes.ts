import { Router } from "express";
import { getCertificateVerification } from "../controllers/publicCertificateController";
import { asyncHandler } from "../middleware/asyncHandler";
import { certificateVerifyLimiter } from "../middleware/rateLimiters";

export const publicRoutes = Router();

/**
 * Unauthenticated by design: the person checking a certificate is a buyer who
 * holds a piece of paper, not an account. Rate limited because the code in the
 * URL is the only input, and it is the one thing worth guessing at.
 */
publicRoutes.get(
  "/certificates/verify/:code",
  certificateVerifyLimiter,
  asyncHandler(getCertificateVerification)
);
