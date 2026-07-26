import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { getAdminEmailHistory, adminRetryJob } from "../email/emailHistoryService";
import { listSuppressions, releaseSuppression } from "../email/suppressionService";

export const adminEmailHistory = async (req: Request, res: Response): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const history = await getAdminEmailHistory({ status });
  res.status(200).json({ history });
};

export const adminRetryEmailJob = async (req: Request, res: Response): Promise<void> => {
  const reason = String(req.body?.reason || "").trim();
  if (!reason) throw new HttpError(400, "reason is required.");
  const job = await adminRetryJob(req.params.id, req.user!.id, reason);
  res.status(200).json({ job });
};

export const adminEmailSuppressions = async (_req: Request, res: Response): Promise<void> => {
  const suppressions = await listSuppressions();
  res.status(200).json({ suppressions });
};

export const adminReleaseEmailSuppression = async (req: Request, res: Response): Promise<void> => {
  const reason = String(req.body?.reason || "").trim();
  if (!reason) throw new HttpError(400, "reason is required.");
  const suppression = await releaseSuppression(req.params.email, req.user!.id, reason);
  res.status(200).json({ suppression });
};
