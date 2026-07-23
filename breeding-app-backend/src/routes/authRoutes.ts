import { Router } from "express";
import {
  changeEmail,
  changePassword,
  confirmEmailChange,
  csrfToken,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { authRecoveryLimiter, authRefreshLimiter, authVerificationLimiter, authWriteLimiter } from "../middleware/rateLimiters";

export const authRoutes = Router();

authRoutes.get("/csrf-token", asyncHandler(csrfToken));
authRoutes.post("/login", authWriteLimiter, asyncHandler(login));
authRoutes.post("/register", authWriteLimiter, asyncHandler(register));
authRoutes.post("/forgot-password", authRecoveryLimiter, asyncHandler(forgotPassword));
authRoutes.post("/reset-password", authRecoveryLimiter, asyncHandler(resetPassword));
authRoutes.get("/verify-email", asyncHandler(verifyEmail));
authRoutes.post("/verify-email", asyncHandler(verifyEmail));
authRoutes.post("/resend-verification", authVerificationLimiter, asyncHandler(resendVerification));
authRoutes.get("/confirm-email-change", asyncHandler(confirmEmailChange));
authRoutes.post("/confirm-email-change", asyncHandler(confirmEmailChange));
authRoutes.post("/refresh", authRefreshLimiter, asyncHandler(refresh));
authRoutes.post("/logout", requireAuth, asyncHandler(logout));
authRoutes.get("/me", requireAuth, asyncHandler(me));
authRoutes.patch("/me/email", requireAuth, authWriteLimiter, asyncHandler(changeEmail));
authRoutes.patch("/me/password", requireAuth, authWriteLimiter, asyncHandler(changePassword));
