import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { getBreederSnapshot, putBreederSnapshot } from "../controllers/breederDataController";

export const breederDataRoutes = Router();

breederDataRoutes.get("/snapshot", requireAuth, requireRole("admin", "breeder"), asyncHandler(getBreederSnapshot));
breederDataRoutes.put("/snapshot", requireAuth, requireRole("admin", "breeder"), asyncHandler(putBreederSnapshot));
