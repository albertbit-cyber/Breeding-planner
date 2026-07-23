import { prisma } from "../lib/prisma";
import type { NotificationCategory } from "./preferencesService";

const db = prisma as any;

export type EmailJobStatus =
  | "pending"
  | "processing"
  | "provider_accepted"
  | "delivered"
  | "delivery_delayed"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed"
  | "cancelled";

/** Once a job reaches one of these statuses, a webhook event must never move it backward. */
const TERMINAL_STATUSES: ReadonlySet<EmailJobStatus> = new Set([
  "delivered",
  "failed",
  "bounced",
  "complained",
  "suppressed",
  "cancelled",
]);

export type EnqueueEmailInput = {
  ownerId: string;
  recipientEmail: string;
  category: NotificationCategory | string;
  templateKey: string;
  templateVersion: number;
  templatePayload: Record<string, unknown>;
  subject: string;
  idempotencyKey: string;
  scheduledFor?: Date;
  relatedEntityType?: string;
  relatedEntityId?: string;
  maximumAttempts?: number;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && (error as { code?: string }).code === "P2002");

/**
 * Enqueue is idempotent by design: calling it twice with the same
 * `idempotencyKey` (e.g. a retried HTTP request, a re-run sync) returns the
 * already-persisted job instead of creating a duplicate row or throwing.
 */
export const enqueueEmail = async (input: EnqueueEmailInput) => {
  try {
    return await db.emailJob.create({
      data: {
        ownerId: input.ownerId,
        recipientEmail: input.recipientEmail.trim().toLowerCase(),
        category: input.category,
        templateKey: input.templateKey,
        templateVersion: input.templateVersion,
        templatePayload: input.templatePayload,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
        scheduledFor: input.scheduledFor || new Date(),
        maximumAttempts: input.maximumAttempts ?? 5,
        relatedEntityType: input.relatedEntityType || null,
        relatedEntityId: input.relatedEntityId || null,
        status: "pending",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return db.emailJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    }
    throw error;
  }
};

/**
 * Cancel any not-yet-terminal job for an idempotency key. Used when the
 * underlying business event changes (e.g. a breeding date moves) and the
 * previously queued reminder is now obsolete.
 */
export const cancelByIdempotencyKey = async (idempotencyKey: string) => {
  const job = await db.emailJob.findUnique({ where: { idempotencyKey } });
  if (!job || TERMINAL_STATUSES.has(job.status) || job.status === "processing") return job;
  return db.emailJob.update({
    where: { id: job.id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
};

export const cancelJob = async (jobId: string) => {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (TERMINAL_STATUSES.has(job.status) || job.status === "processing") return job;
  return db.emailJob.update({
    where: { id: jobId },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
};

/**
 * Atomically claims up to `batchSize` due jobs for this worker using
 * `FOR UPDATE SKIP LOCKED`, so multiple worker instances (or overlapping
 * poll ticks) never claim the same job twice.
 */
export const claimNextBatch = async (batchSize: number): Promise<any[]> => {
  return db.$queryRaw`
    UPDATE email_jobs
    SET status = 'processing',
        processing_started_at = now(),
        attempt_count = attempt_count + 1,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM email_jobs
      WHERE status = 'pending'
        AND scheduled_for <= now()
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY scheduled_for ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
  `;
};

/** Resets jobs stuck in `processing` past the given cutoff back to `pending` (or `failed` once attempts are exhausted). */
export const recoverStuckJobs = async (stuckMinutes: number): Promise<number> => {
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000);

  const stuck = await db.emailJob.findMany({
    where: { status: "processing", processingStartedAt: { lt: cutoff } },
    select: { id: true, attemptCount: true, maximumAttempts: true },
  });

  let recovered = 0;
  for (const job of stuck) {
    if (job.attemptCount >= job.maximumAttempts) {
      await db.emailJob.update({
        where: { id: job.id },
        data: { status: "failed", failedAt: new Date(), lastErrorCode: "worker_stuck", lastErrorMessage: "Worker died or crashed while processing this job." },
      });
    } else {
      await db.emailJob.update({
        where: { id: job.id },
        data: { status: "pending", nextAttemptAt: new Date() },
      });
    }
    recovered += 1;
  }
  return recovered;
};

const BASE_RETRY_DELAY_MS = 30_000;
const RETRY_BACKOFF_FACTOR = 3;
const MAX_RETRY_DELAY_MS = 60 * 60_000;

export const computeNextAttemptDelay = (attemptCount: number): number =>
  Math.min(BASE_RETRY_DELAY_MS * RETRY_BACKOFF_FACTOR ** Math.max(0, attemptCount - 1), MAX_RETRY_DELAY_MS);

export const markSent = async (jobId: string, provider: string, providerMessageId: string) =>
  db.emailJob.update({
    where: { id: jobId },
    data: { status: "provider_accepted", provider, providerMessageId, sentAt: new Date() },
  });

export const scheduleRetry = async (jobId: string, errorCode: string, errorMessage: string) => {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (job.attemptCount >= job.maximumAttempts) {
    return db.emailJob.update({
      where: { id: jobId },
      data: { status: "failed", failedAt: new Date(), lastErrorCode: errorCode, lastErrorMessage: errorMessage },
    });
  }
  return db.emailJob.update({
    where: { id: jobId },
    data: {
      status: "pending",
      nextAttemptAt: new Date(Date.now() + computeNextAttemptDelay(job.attemptCount)),
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage,
    },
  });
};

export const markPermanentFailure = async (jobId: string, errorCode: string, errorMessage: string) =>
  db.emailJob.update({
    where: { id: jobId },
    data: { status: "failed", failedAt: new Date(), lastErrorCode: errorCode, lastErrorMessage: errorMessage },
  });

export const markSuppressed = async (jobId: string) =>
  db.emailJob.update({
    where: { id: jobId },
    data: { status: "suppressed" },
  });

export const markCancelledBySystem = async (jobId: string, reason: string) =>
  db.emailJob.update({
    where: { id: jobId },
    data: { status: "cancelled", cancelledAt: new Date(), lastErrorMessage: reason },
  });

export const findJobByProviderMessageId = async (providerMessageId: string) =>
  db.emailJob.findFirst({ where: { providerMessageId } });

/** Rank used to prevent an out-of-order or duplicate webhook event from moving a job status backward. */
const STATUS_RANK: Record<EmailJobStatus, number> = {
  pending: 0,
  processing: 1,
  provider_accepted: 2,
  delivery_delayed: 3,
  delivered: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
  suppressed: 5,
  cancelled: 5,
};

export const applyWebhookStatus = async (
  jobId: string,
  nextStatus: EmailJobStatus,
  timestampField: "sentAt" | "deliveredAt" | "failedAt" | null
) => {
  const job = await db.emailJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const currentRank = STATUS_RANK[job.status as EmailJobStatus] ?? 0;
  const nextRank = STATUS_RANK[nextStatus];
  if (nextRank < currentRank) return job;

  const data: Record<string, unknown> = { status: nextStatus };
  if (timestampField) data[timestampField] = new Date();

  return db.emailJob.update({ where: { id: jobId }, data });
};

export type RecordEventResult = { event: any; created: boolean };

export const recordEvent = async (
  emailJobId: string,
  providerEventId: string | null,
  type: string,
  occurredAt: Date,
  rawSummary: Record<string, unknown> | null
): Promise<RecordEventResult> => {
  try {
    const event = await db.emailEvent.create({
      data: { emailJobId, providerEventId, type, occurredAt, rawSummary: rawSummary || undefined },
    });
    return { event, created: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // Duplicate delivery of the same provider event id — already recorded, no-op.
      const event = await db.emailEvent.findUnique({ where: { providerEventId: providerEventId as string } });
      return { event, created: false };
    }
    throw error;
  }
};

export const listJobsForOwner = async (ownerId: string, take = 100) =>
  db.emailJob.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: "desc" }],
    take,
  });

export const listJobsForAdmin = async (filters: { status?: string; take?: number } = {}) =>
  db.emailJob.findMany({
    where: filters.status ? { status: filters.status } : undefined,
    orderBy: [{ createdAt: "desc" }],
    take: filters.take ?? 200,
  });

export const getJobForOwner = async (jobId: string, ownerId: string) =>
  db.emailJob.findFirst({ where: { id: jobId, ownerId } });
