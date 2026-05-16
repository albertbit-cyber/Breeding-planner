import type { Request, Response } from "express";
import {
  getAdminDashboard,
  getAdminReportDetail,
  getAdminVerificationRequestDetail,
  listAdminAuditLogs,
  listAdminReports,
  listAdminVerificationRequests,
  getAdminUserDetail,
  listAdminUsers,
  applyAdminReportAction,
  createAdminGdprRequest,
  getAdminMarketplacePermission,
  listAdminGdprRequests,
  listAdminLabAccounts,
  updateAdminVerificationRequest,
  sendAdminNotification,
  updateAdminGdprRequest,
  updateAdminLabAccount,
  updateAdminMarketplacePermission,
  updateAdminReportStatus,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateAdminUserSubscription,
  updateAdminUserVerification,
} from "../services/adminService";

export const dashboard = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getAdminDashboard());
};

export const users = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminUsers(req.query));
};

export const reports = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminReports(req.query));
};

export const reportDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getAdminReportDetail(req.params.id));
};

export const auditLogs = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminAuditLogs({ ...req.query, targetUserId: req.params.id || req.query.targetUserId }));
};

export const verificationRequests = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminVerificationRequests(req.query));
};

export const verificationRequestDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getAdminVerificationRequestDetail(req.params.id));
};

export const userDetail = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getAdminUserDetail(req.params.id));
};

export const changeUserRole = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminUserRole(req.user!, req.params.id, req.body || {}));
};

export const changeUserStatus = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminUserStatus(req.user!, req.params.id, req.body || {}));
};

export const changeUserSubscription = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminUserSubscription(req.user!, req.params.id, req.body || {}));
};

export const changeUserVerification = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminUserVerification(req.user!, req.params.id, req.body || {}));
};

export const changeReportStatus = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminReportStatus(req.user!, req.params.id, req.body || {}));
};

export const reportAction = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await applyAdminReportAction(req.user!, req.params.id, req.body || {}));
};

export const changeVerificationRequest = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminVerificationRequest(req.user!, req.params.id, req.body || {}));
};

export const approveVerificationRequest = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminVerificationRequest(req.user!, req.params.id, { ...(req.body || {}), status: "approved" }));
};

export const rejectVerificationRequest = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminVerificationRequest(req.user!, req.params.id, { ...(req.body || {}), status: "rejected" }));
};

export const requestMoreVerificationInfo = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminVerificationRequest(req.user!, req.params.id, { ...(req.body || {}), status: "more_info_requested" }));
};

export const revokeVerificationRequest = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminVerificationRequest(req.user!, req.params.id, { ...(req.body || {}), status: "revoked" }));
};

export const marketplacePermission = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await getAdminMarketplacePermission(req.params.id));
};

export const changeMarketplacePermission = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminMarketplacePermission(req.user!, req.params.id, req.body || {}));
};

export const labAccounts = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminLabAccounts(req.query));
};

export const changeLabAccount = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminLabAccount(req.user!, req.params.id, req.body || {}));
};

export const sendNotification = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await sendAdminNotification(req.user!, req.body || {}));
};

export const gdprRequests = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await listAdminGdprRequests(req.query));
};

export const createGdprRequest = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createAdminGdprRequest(req.user!, req.params.id, req.body || {}));
};

export const changeGdprRequest = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json(await updateAdminGdprRequest(req.user!, req.params.id, req.body || {}));
};
