import { Router } from "express";
import {
  calculateOrderPrice,
  createLabOrder,
  getOrderById,
  listOrders,
  patchOrderStatus,
  removeAllOrders,
  saveOrderResultDraft,
  submitOrderResult,
} from "../controllers/orderController";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { asyncHandler } from "../middleware/asyncHandler";

export const orderRoutes = Router();

orderRoutes.post("/calculate-price", requireAuth, requireRole("admin", "lab", "breeder"), asyncHandler(calculateOrderPrice));
orderRoutes.post("/", requireAuth, requireRole("breeder"), asyncHandler(createLabOrder));
orderRoutes.get("/", requireAuth, requireRole("admin", "lab", "breeder"), asyncHandler(listOrders));
orderRoutes.delete("/", requireAuth, requireRole("admin", "lab"), asyncHandler(removeAllOrders));
orderRoutes.get("/:id", requireAuth, requireRole("admin", "lab", "breeder"), asyncHandler(getOrderById));
orderRoutes.post("/:id/results/draft", requireAuth, requireRole("admin", "lab"), asyncHandler(saveOrderResultDraft));
orderRoutes.post("/:id/results/submit", requireAuth, requireRole("admin", "lab"), asyncHandler(submitOrderResult));
orderRoutes.patch("/:id/status", requireAuth, requireRole("admin", "lab"), asyncHandler(patchOrderStatus));
