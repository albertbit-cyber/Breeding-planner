import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { getBreedingCycles, getFollicleExaminations, getBreedingOverview } from "../controllers/breedingController";

/**
 * Read endpoints for the breeding cards. Writes travel with the cloud sync
 * (PUT /api/breeder/snapshot) so a device that is offline keeps working; these
 * routes exist for other clients and for checks against the stored data.
 */
export const breedingRoutes = Router();

const auth = [requireAuth, requireRole("admin", "breeder")];

breedingRoutes.get("/cycles", ...auth, asyncHandler(getBreedingCycles));
breedingRoutes.get("/follicle-exams", ...auth, asyncHandler(getFollicleExaminations));
breedingRoutes.get("/overview", ...auth, asyncHandler(getBreedingOverview));
