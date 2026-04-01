import { Router } from "express";
import { login, me, register } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(login));
authRoutes.post("/register", asyncHandler(register));
authRoutes.get("/me", requireAuth, asyncHandler(me));
