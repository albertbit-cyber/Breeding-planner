import { Router } from "express";
import {
  calculateOrderPrice,
  cancelMyOrder,
  createLabOrder,
  getOrderById,
  listOrders,
  patchOrderStatus,
  patchOrderPayment,
  removeOrder,
  removeAllOrders,
  saveOrderResultDraft,
  submitOrderResult,
} from "../controllers/orderController";
import { requireAuth, requireVerifiedEmail } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { asyncHandler } from "../middleware/asyncHandler";

export const orderRoutes = Router();

orderRoutes.post("/calculate-price", requireAuth, requireRole("admin", "lab", "breeder"), asyncHandler(calculateOrderPrice));
orderRoutes.post("/", requireAuth, requireRole("breeder"), asyncHandler(requireVerifiedEmail), asyncHandler(createLabOrder));
orderRoutes.get("/", requireAuth, requireRole("admin", "lab", "breeder"), asyncHandler(listOrders));
orderRoutes.delete("/", requireAuth, requireRole("admin"), asyncHandler(removeAllOrders));
orderRoutes.delete("/:id", requireAuth, requireRole("admin", "lab"), asyncHandler(removeOrder));
orderRoutes.delete("/:id/cancel", requireAuth, requireRole("breeder"), asyncHandler(cancelMyOrder));
orderRoutes.get("/:id", requireAuth, requireRole("admin", "lab", "breeder"), asyncHandler(getOrderById));
orderRoutes.post("/:id/results/draft", requireAuth, requireRole("admin", "lab"), asyncHandler(saveOrderResultDraft));
orderRoutes.post("/:id/results/submit", requireAuth, requireRole("admin", "lab"), asyncHandler(submitOrderResult));
orderRoutes.patch("/:id/status", requireAuth, requireRole("admin", "lab"), asyncHandler(patchOrderStatus));
orderRoutes.patch("/:id/payment", requireAuth, requireRole("admin", "lab"), asyncHandler(patchOrderPayment));
