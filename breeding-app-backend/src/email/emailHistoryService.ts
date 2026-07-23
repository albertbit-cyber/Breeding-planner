import { listJobsForAdmin, listJobsForOwner, getJobForOwner, cancelJob } from "./queueService";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { maskEmail } from "../utils/maskEmail";

const db = prisma as any;

/** Fields safe to show to the recipient's own account. No internal ids, provider payloads, or secrets. */
const toUserSafeDto = (job: any) => ({
  templateKey: job.templateKey,
  category: job.category,
  recipient: maskEmail(job.recipientEmail),
  scheduledFor: job.scheduledFor,
  status: job.status,
  sentAt: job.sentAt,
  deliveredAt: job.deliveredAt,
  failedAt: job.failedAt,
  cancelledAt: job.cancelledAt,
  failureReason: job.status === "failed" || job.status === "bounced" ? "This message could not be delivered." : null,
  relatedEntityType: job.relatedEntityType,
  relatedEntityId: job.relatedEntityId,
  createdAt: job.createdAt,
});

/** Fields visible to operators/admins — still excludes provider raw payloads and secrets. */
const toAdminSafeDto = (job: any) => ({
  id: job.id,
  ownerId: job.ownerId,
  templateKey: job.templateKey,
  category: job.category,
  recipient: maskEmail(job.recipientEmail),
  status: job.status,
  attemptCount: job.attemptCount,
  maximumAttempts: job.maximumAttempts,
  provider: job.provider,
  lastErrorCode: job.lastErrorCode,
  lastErrorMessage: job.lastErrorMessage,
  scheduledFor: job.scheduledFor,
  nextAttemptAt: job.nextAttemptAt,
  sentAt: job.sentAt,
  deliveredAt: job.deliveredAt,
  failedAt: job.failedAt,
  cancelledAt: job.cancelledAt,
  createdAt: job.createdAt,
});

export const getMyEmailHistory = async (ownerId: string) => {
  const jobs = await listJobsForOwner(ownerId);
  return jobs.map(toUserSafeDto);
};

export const getAdminEmailHistory = async (filters: { status?: string } = {}) => {
  const jobs = await listJobsForAdmin(filters);
  return jobs.map(toAdminSafeDto);
};

/** Authorized admin retry of a failed/cancelled job — re-queues it for the worker to pick up again. */
export const adminRetryJob = async (jobId: string, adminUserId: string, reason: string) => {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job) throw new HttpError(404, "Email job not found.");
  if (!["failed", "cancelled", "bounced"].includes(job.status)) {
    throw new HttpError(400, "Only failed, bounced, or cancelled jobs can be retried.");
  }

  const retried = await db.emailJob.update({
    where: { id: jobId },
    data: { status: "pending", nextAttemptAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
  });

  await db.adminAuditLog.create({
    data: {
      adminUserId,
      action: "email_job_retried",
      beforeJson: { jobId, previousStatus: job.status },
      afterJson: { jobId, status: "pending" },
      reason,
    },
  });

  return toAdminSafeDto(retried);
};

export { cancelJob, getJobForOwner };
