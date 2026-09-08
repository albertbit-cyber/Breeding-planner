import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { getAdminEmailHistory, adminRetryJob } from "../email/emailHistoryService";
import { listSuppressions, releaseSuppression } from "../email/suppressionService";
import { collectMailDiagnostics } from "../email/diagnosticsService";
import { sendDiagnosticTestEmail } from "../email/testSendService";

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

export const adminMailDiagnostics = async (_req: Request, res: Response): Promise<void> => {
  res.status(200).json(await collectMailDiagnostics());
};

/**
 * Sends a real message through the configured transport, right now, bypassing
 * the queue. The queue deliberately hides provider errors behind a job row;
 * this hands the provider's own rejection text straight back to the operator,
 * which is the fastest way to tell a missing API key from an unverified domain.
 */
export const adminSendTestEmail = async (req: Request, res: Response): Promise<void> => {
  const recipient = String(req.body?.recipient || "").trim();
  if (!recipient) throw new HttpError(400, "recipient is required.");
  res.status(200).json(await sendDiagnosticTestEmail(recipient, req.user!.id));
};
