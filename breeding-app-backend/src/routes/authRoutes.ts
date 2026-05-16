import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, me, recoverPassword, refresh, register } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";

export const authRoutes = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

authRoutes.post("/login", authLimiter, asyncHandler(login));
authRoutes.post("/register", authLimiter, asyncHandler(register));
authRoutes.post("/recover-password", authLimiter, asyncHandler(recoverPassword));
authRoutes.post("/refresh", asyncHandler(refresh));
authRoutes.get("/me", requireAuth, asyncHandler(me));
