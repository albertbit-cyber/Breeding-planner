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
  exportMyData,
  deletionStatus,
  requestDeletion,
  cancelDeletion,
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

// Data rights. The export is rate-limited as a write despite being a GET: it
// fans out across every table the user touches, so it is far from free.
authRoutes.get("/me/export", requireAuth, authWriteLimiter, asyncHandler(exportMyData));
authRoutes.get("/me/deletion", requireAuth, asyncHandler(deletionStatus));
authRoutes.post("/me/deletion", requireAuth, authWriteLimiter, asyncHandler(requestDeletion));
authRoutes.delete("/me/deletion", requireAuth, authWriteLimiter, asyncHandler(cancelDeletion));
