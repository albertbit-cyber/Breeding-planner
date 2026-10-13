import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import {
  getBreederSnapshot,
  listBreederDataReplacementsHandler,
  putBreederSnapshot,
  replaceBreederDataHandler,
  undoBreederDataReplacementHandler,
} from "../controllers/breederDataController";

export const breederDataRoutes = Router();

breederDataRoutes.get("/snapshot", requireAuth, requireRole("admin", "breeder"), asyncHandler(getBreederSnapshot));
breederDataRoutes.put("/snapshot", requireAuth, requireRole("admin", "breeder"), asyncHandler(putBreederSnapshot));

// Full replace of the account from a backup file, its history, and undo (breederDataReplaceService).
breederDataRoutes.post("/replace", requireAuth, requireRole("admin", "breeder"), asyncHandler(replaceBreederDataHandler));
breederDataRoutes.get("/replacements", requireAuth, requireRole("admin", "breeder"), asyncHandler(listBreederDataReplacementsHandler));
breederDataRoutes.post("/replacements/:id/undo", requireAuth, requireRole("admin", "breeder"), asyncHandler(undoBreederDataReplacementHandler));
