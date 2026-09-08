import { Router } from "express";
import {
  archiveOrder,
  calculateOrderPrice,
  cancelMyOrder,
  createLabOrder,
  getCertificateById,
  getOrderById,
  listMyCertificates,
  listOrders,
  patchOrderStatus,
  patchOrderPayment,
  removeOrder,
  removeAllOrders,
  saveOrderResultDraft,
  submitOrderResult,
  unarchiveOrder,
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
// Registered above `/:id` on purpose: Express matches in declaration order, and
// `/certificates` would otherwise be read as an order id.
orderRoutes.get("/certificates", requireRole("admin", "lab", "breeder"), asyncHandler(listMyCertificates));
orderRoutes.get("/certificates/:id", requireRole("admin", "lab", "breeder"), asyncHandler(getCertificateById));
orderRoutes.get("/:id", requireRole("admin", "lab", "breeder"), asyncHandler(getOrderById));
// Archiving is the laboratory filing its own copy away. It is not offered to
// breeders: an order the breeder paid for is not the lab's to hide from them.
orderRoutes.post("/:id/archive", requireRole("admin", "lab"), asyncHandler(archiveOrder));
orderRoutes.post("/:id/unarchive", requireRole("admin", "lab"), asyncHandler(unarchiveOrder));
orderRoutes.post("/:id/results/draft", requireRole("admin", "lab"), asyncHandler(saveOrderResultDraft));
orderRoutes.post("/:id/results/submit", requireRole("admin", "lab"), asyncHandler(submitOrderResult));
orderRoutes.patch("/:id/status", requireRole("admin", "lab"), asyncHandler(patchOrderStatus));
orderRoutes.patch("/:id/payment", requireRole("admin", "lab"), asyncHandler(patchOrderPayment));
