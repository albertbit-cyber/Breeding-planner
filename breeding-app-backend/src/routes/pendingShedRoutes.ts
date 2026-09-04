import { Router } from "express";
import {
  deletePendingShedTest,
  getPendingShedTests,
  patchPendingShedTest,
  postPendingShedQuote,
  postPendingShedSubmit,
  postPendingShedTest,
} from "../controllers/pendingShedController";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { asyncHandler } from "../middleware/asyncHandler";

export const pendingShedRoutes = Router();

// The saved queue belongs to a breeder, not to a laboratory, so unlike the order routes there
// is no tenant context to establish -- every handler scopes to the acting user's own id.
pendingShedRoutes.use(requireAuth, requireRole("breeder"));

pendingShedRoutes.get("/", asyncHandler(getPendingShedTests));
pendingShedRoutes.post("/", asyncHandler(postPendingShedTest));
pendingShedRoutes.patch("/:id", asyncHandler(patchPendingShedTest));
pendingShedRoutes.delete("/:id", asyncHandler(deletePendingShedTest));
pendingShedRoutes.post("/quote", asyncHandler(postPendingShedQuote));

// Verified email required to submit, matching order creation: this is the step that places a
// real order with a laboratory, and saving a draft is not.
pendingShedRoutes.post("/submit", asyncHandler(requireVerifiedEmail), asyncHandler(postPendingShedSubmit));
