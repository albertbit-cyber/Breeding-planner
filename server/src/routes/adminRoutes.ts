import { Router } from "express";
import {
  approveVerificationRequest,
  auditLogs,
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
  reportDetail,
  reports,
  rejectVerificationRequest,
  requestMoreVerificationInfo,
  revokeVerificationRequest,
  sendNotification,
  userDetail,
  users,
  verificationRequests,
  verificationRequestDetail,
} from "../controllers/adminController";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireRole("admin"));

adminRoutes.get("/dashboard", asyncHandler(dashboard));
adminRoutes.get("/reports", asyncHandler(reports));
adminRoutes.get("/reports/:id", asyncHandler(reportDetail));
adminRoutes.patch("/reports/:id/status", asyncHandler(changeReportStatus));
adminRoutes.post("/reports/:id/action", asyncHandler(reportAction));
adminRoutes.get("/audit-logs", asyncHandler(auditLogs));
adminRoutes.get("/verification-requests", asyncHandler(verificationRequests));
adminRoutes.get("/verification-requests/:id", asyncHandler(verificationRequestDetail));
adminRoutes.patch("/verification-requests/:id/approve", asyncHandler(approveVerificationRequest));
adminRoutes.patch("/verification-requests/:id/reject", asyncHandler(rejectVerificationRequest));
adminRoutes.patch("/verification-requests/:id/request-more-info", asyncHandler(requestMoreVerificationInfo));
adminRoutes.patch("/verification-requests/:id/revoke", asyncHandler(revokeVerificationRequest));
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
adminRoutes.get("/users/:id/audit-logs", asyncHandler(auditLogs));
adminRoutes.get("/users/:id", asyncHandler(userDetail));
adminRoutes.patch("/users/:id/role", asyncHandler(changeUserRole));
adminRoutes.patch("/users/:id/status", asyncHandler(changeUserStatus));
adminRoutes.patch("/users/:id/subscription", asyncHandler(changeUserSubscription));
adminRoutes.patch("/users/:id/verification", asyncHandler(changeUserVerification));
