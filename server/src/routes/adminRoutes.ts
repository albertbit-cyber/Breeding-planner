import { Router } from "express";
import {
  changeUserRole,
  changeUserStatus,
  changeUserSubscription,
  changeUserVerification,
  changeGdprRequest,
  changeLabAccount,
  changeMarketplacePermission,
  changeReportStatus,
  changeVerificationRequest,
  createGdprRequest,
  dashboard,
  gdprRequests,
  labAccounts,
  marketplacePermission,
  reportAction,
  reports,
  sendNotification,
  userDetail,
  users,
  verificationRequests,
} from "../controllers/adminController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRole("admin"));

adminRoutes.get("/dashboard", asyncHandler(dashboard));
adminRoutes.get("/reports", asyncHandler(reports));
adminRoutes.patch("/reports/:id/status", asyncHandler(changeReportStatus));
adminRoutes.post("/reports/:id/action", asyncHandler(reportAction));
adminRoutes.get("/verification-requests", asyncHandler(verificationRequests));
adminRoutes.patch("/verification-requests/:id", asyncHandler(changeVerificationRequest));
adminRoutes.get("/users/:id/marketplace-permission", asyncHandler(marketplacePermission));
adminRoutes.patch("/users/:id/marketplace-permission", asyncHandler(changeMarketplacePermission));
adminRoutes.get("/lab-accounts", asyncHandler(labAccounts));
adminRoutes.patch("/lab-accounts/:id", asyncHandler(changeLabAccount));
adminRoutes.post("/notifications/send", asyncHandler(sendNotification));
adminRoutes.get("/gdpr-requests", asyncHandler(gdprRequests));
adminRoutes.post("/users/:id/gdpr-requests", asyncHandler(createGdprRequest));
adminRoutes.patch("/gdpr-requests/:id", asyncHandler(changeGdprRequest));
adminRoutes.get("/users", asyncHandler(users));
adminRoutes.get("/users/:id", asyncHandler(userDetail));
adminRoutes.patch("/users/:id/role", asyncHandler(changeUserRole));
adminRoutes.patch("/users/:id/status", asyncHandler(changeUserStatus));
adminRoutes.patch("/users/:id/subscription", asyncHandler(changeUserSubscription));
adminRoutes.patch("/users/:id/verification", asyncHandler(changeUserVerification));
