import { Router } from "express";
import { changeEmail, changePassword, csrfToken, forgotPassword, login, logout, me, refresh, register, resetPassword, verifyEmail } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { authRecoveryLimiter, authRefreshLimiter, authWriteLimiter } from "../middleware/rateLimiters";

export const authRoutes = Router();

authRoutes.get("/csrf-token", asyncHandler(csrfToken));
authRoutes.post("/login", authWriteLimiter, asyncHandler(login));
authRoutes.post("/register", authWriteLimiter, asyncHandler(register));
authRoutes.post("/forgot-password", authRecoveryLimiter, asyncHandler(forgotPassword));
authRoutes.post("/reset-password", authRecoveryLimiter, asyncHandler(resetPassword));
authRoutes.get("/verify-email", asyncHandler(verifyEmail));
authRoutes.post("/verify-email", asyncHandler(verifyEmail));
authRoutes.post("/refresh", authRefreshLimiter, asyncHandler(refresh));
authRoutes.post("/logout", requireAuth, asyncHandler(logout));
authRoutes.get("/me", requireAuth, asyncHandler(me));
authRoutes.patch("/me/email", requireAuth, authWriteLimiter, asyncHandler(changeEmail));
authRoutes.patch("/me/password", requireAuth, authWriteLimiter, asyncHandler(changePassword));
