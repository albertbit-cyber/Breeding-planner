import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import {
  getReproductiveProfile,
  postManualLock,
  putCycleManual,
} from "../controllers/reproductiveController";

export const reproductiveRoutes = Router();

const auth = [requireAuth, requireRole("admin", "breeder")];

// GET  /api/reproductive/female/:femaleAppId
reproductiveRoutes.get("/female/:femaleAppId", ...auth, asyncHandler(getReproductiveProfile));

// POST /api/reproductive/female/:femaleAppId/lock
reproductiveRoutes.post("/female/:femaleAppId/lock", ...auth, asyncHandler(postManualLock));

// PUT  /api/reproductive/female/:femaleAppId/cycle
reproductiveRoutes.put("/female/:femaleAppId/cycle", ...auth, asyncHandler(putCycleManual));
