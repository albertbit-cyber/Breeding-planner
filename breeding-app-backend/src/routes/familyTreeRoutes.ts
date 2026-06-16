import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import {
  getMyAnimals,
  getSnakePedigreeHandler,
  getAncestorsHandler,
  getDescendantsHandler,
  getStatsHandler,
} from "../controllers/familyTreeController";

export const familyTreeRoutes = Router();

const auth = [requireAuth, requireRole("breeder", "admin")];

// Animal picker — returns the authenticated user's animals with DB IDs
familyTreeRoutes.get("/animals",                    ...auth, asyncHandler(getMyAnimals));

// Pedigree centered on a snake (2 ancestor gen + 1 offspring gen)
familyTreeRoutes.get("/snake/:id",                  ...auth, asyncHandler(getSnakePedigreeHandler));

// Lazy-load more ancestors (?depth=N, max 4)
familyTreeRoutes.get("/snake/:id/ancestors",        ...auth, asyncHandler(getAncestorsHandler));

// Lazy-load more descendants (?depth=N, max 4)
familyTreeRoutes.get("/snake/:id/descendants",      ...auth, asyncHandler(getDescendantsHandler));

// Global stats for the stats bar
familyTreeRoutes.get("/stats",                      ...auth, asyncHandler(getStatsHandler));
