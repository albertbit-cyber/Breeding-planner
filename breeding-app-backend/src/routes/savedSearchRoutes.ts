import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import {
  deleteSavedSearch,
  getMySavedSearches,
  postSavedSearch,
} from "../controllers/savedSearchController";

export const savedSearchRoutes = Router();

savedSearchRoutes.get("/", requireAuth, asyncHandler(getMySavedSearches));
savedSearchRoutes.post("/", requireAuth, asyncHandler(postSavedSearch));
savedSearchRoutes.delete("/:id", requireAuth, asyncHandler(deleteSavedSearch));
