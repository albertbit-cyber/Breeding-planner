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
import { withOrgContext } from "../middleware/orgContext";
import { asyncHandler } from "../middleware/asyncHandler";

export const orderRoutes = Router();

// Every order route runs inside a tenant context. Mounted once here rather than
// per-route so a future route cannot be added without it — the order service
// refuses to serve a lab actor with no organization, so a missing
// `withOrgContext` fails closed rather than leaking another lab's queue.
orderRoutes.use(requireAuth, asyncHandler(withOrgContext));

orderRoutes.post("/calculate-price", requireRole("admin", "lab", "breeder"), asyncHandler(calculateOrderPrice));
orderRoutes.post("/", requireRole("breeder"), asyncHandler(requireVerifiedEmail), asyncHandler(createLabOrder));
orderRoutes.get("/", requireRole("admin", "lab", "breeder"), asyncHandler(listOrders));
orderRoutes.delete("/", requireRole("admin"), asyncHandler(removeAllOrders));
orderRoutes.delete("/:id", requireRole("admin", "lab"), asyncHandler(removeOrder));
orderRoutes.delete("/:id/cancel", requireRole("breeder"), asyncHandler(cancelMyOrder));
orderRoutes.get("/:id", requireRole("admin", "lab", "breeder"), asyncHandler(getOrderById));
orderRoutes.post("/:id/results/draft", requireRole("admin", "lab"), asyncHandler(saveOrderResultDraft));
orderRoutes.post("/:id/results/submit", requireRole("admin", "lab"), asyncHandler(submitOrderResult));
orderRoutes.patch("/:id/status", requireRole("admin", "lab"), asyncHandler(patchOrderStatus));
orderRoutes.patch("/:id/payment", requireRole("admin", "lab"), asyncHandler(patchOrderPayment));
