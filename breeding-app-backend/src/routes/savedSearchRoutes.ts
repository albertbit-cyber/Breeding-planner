import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import {
  deleteSavedSearch,
  getMySavedSearches,
  markSavedSearchRun,
  postSavedSearch,
} from "../controllers/savedSearchController";

export const savedSearchRoutes = Router();

savedSearchRoutes.get("/", requireAuth, asyncHandler(getMySavedSearches));
savedSearchRoutes.post("/", requireAuth, asyncHandler(postSavedSearch));
savedSearchRoutes.post("/:id/run", requireAuth, asyncHandler(markSavedSearchRun));
savedSearchRoutes.delete("/:id", requireAuth, asyncHandler(deleteSavedSearch));
