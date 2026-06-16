import { Router } from "express";
import { getCatalog, getPricing, patchCatalogItem, patchPricing } from "../controllers/labController";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { asyncHandler } from "../middleware/asyncHandler";

export const labRoutes = Router();

labRoutes.get("/tests/catalog", requireAuth, asyncHandler(getCatalog));
labRoutes.get("/tests/pricing", requireAuth, asyncHandler(getPricing));

labRoutes.patch("/tests/catalog/:id", requireAuth, requireRole("admin", "lab"), asyncHandler(patchCatalogItem));
labRoutes.patch("/pricing/:id", requireAuth, requireRole("admin", "lab"), asyncHandler(patchPricing));
