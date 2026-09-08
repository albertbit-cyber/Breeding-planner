import { env } from "../config/env";
import type { EmailProvider } from "./provider";
import { getEmailProvider, logMailTransportStatus } from "./providerFactory";
import { isCategoryEnabled, REQUIRED_CATEGORIES, type NotificationCategory } from "./preferencesService";
import { isRecipientSuppressed } from "./suppressionService";
import { renderEmailTemplate } from "./templates";
import {
  claimNextBatch,
  markCancelledBySystem,
  markPermanentFailure,
  markSent,
  markSuppressed,
  recoverStuckJobs,
  scheduleRetry,
} from "./queueService";
import { EmailError } from "./types";
import { logDevActionLink, logEmailAttempt } from "./sendLog";

/** Processes exactly one already-claimed (status=processing) job. Never throws — every failure path updates the job row instead. */
export const processEmailJob = async (job: any, provider: EmailProvider): Promise<void> => {
  const category = job.category as NotificationCategory;

  try {
    if (!REQUIRED_CATEGORIES.has(category)) {
      const enabled = await isCategoryEnabled(job.ownerId, category);
      if (!enabled) {
        await markCancelledBySystem(job.id, "Recipient has disabled this notification category.");
        logEmailAttempt({
          jobId: job.id,
          recipient: job.recipientEmail,
          template: job.templateKey,
          category,
          outcome: "skipped",
          reason: "Recipient has disabled this notification category.",
        });
        return;
      }

      const suppressed = await isRecipientSuppressed(job.recipientEmail);
      if (suppressed) {
        await markSuppressed(job.id);
        logEmailAttempt({
          jobId: job.id,
          recipient: job.recipientEmail,
          template: job.templateKey,
          category,
          outcome: "skipped",
          reason: "Recipient address is suppressed (previous bounce or complaint).",
        });
        return;
      }
    }

    const rendered = renderEmailTemplate(job.templateKey, job.templateVersion, job.templatePayload as Record<string, unknown>);

    const result = await provider.send({
      to: job.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: job.idempotencyKey,
      tags: { category, template: job.templateKey },
    });

    await markSent(job.id, result.provider, result.providerMessageId);
    logEmailAttempt({
      jobId: job.id,
      recipient: job.recipientEmail,
      template: job.templateKey,
      category,
      outcome: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      attempt: job.attemptCount,
    });

    // The mock provider accepted this and threw it away. In development that is
    // recoverable — print the link the recipient would have clicked instead of
    // leaving them with nothing.
    if (result.provider === "mock") {
      logDevActionLink(job);
    }
  } catch (error) {
    if (error instanceof EmailError) {
      if (error.retryable) {
        await scheduleRetry(job.id, error.code, error.message);
      } else {
        await markPermanentFailure(job.id, error.code, error.message);
      }
      logEmailAttempt({
        jobId: job.id,
        recipient: job.recipientEmail,
        template: job.templateKey,
        category,
        outcome: "failed",
        provider: provider.name,
        reason: error.code,
        error,
        attempt: job.attemptCount,
        willRetry: error.retryable,
      });
      return;
    }

    // Unexpected/unknown errors are treated as retryable so a transient bug
    // doesn't strand a job forever, but they still count against maximumAttempts.
    const message = error instanceof Error ? error.message : "Unknown error";
    await scheduleRetry(job.id, "unknown_error", message);
    logEmailAttempt({
      jobId: job.id,
      recipient: job.recipientEmail,
      template: job.templateKey,
      category,
      outcome: "failed",
      provider: provider.name,
      reason: "unknown_error",
      error,
      attempt: job.attemptCount,
      willRetry: true,
    });
  }
};

export const runWorkerTick = async (provider: EmailProvider, batchSize: number, stuckJobMinutes: number): Promise<number> => {
  await recoverStuckJobs(stuckJobMinutes).catch((error) => {
    console.error("[email-worker] stuck-job recovery failed", error instanceof Error ? error.message : error);
  });

  const jobs = await claimNextBatch(batchSize);
  for (const job of jobs) {
    // Each job is isolated: one malformed payload must not stop the batch.
    await processEmailJob(job, provider);
  }
  return jobs.length;
};

let timer: ReturnType<typeof setInterval> | null = null;
let inFlightTick: Promise<number> = Promise.resolve(0);

/**
 * Last observed state of the polling loop, read by the mail diagnostics
 * endpoint. Without this, "no mail arrived" cannot distinguish a worker that
 * never started from one that is running and failing every job — the two have
 * completely different fixes.
 */
export type EmailWorkerHeartbeat = {
  started: boolean;
  lastTickAt: Date | null;
  lastTickClaimed: number | null;
  lastTickError: string | null;
  ticks: number;
};

const heartbeat: EmailWorkerHeartbeat = {
  started: false,
  lastTickAt: null,
  lastTickClaimed: null,
  lastTickError: null,
  ticks: 0,
};

export const getEmailWorkerHeartbeat = (): EmailWorkerHeartbeat => ({ ...heartbeat });

/** Test seam: resets the heartbeat between cases. */
export const resetEmailWorkerHeartbeat = (): void => {
  heartbeat.started = false;
  heartbeat.lastTickAt = null;
  heartbeat.lastTickClaimed = null;
  heartbeat.lastTickError = null;
  heartbeat.ticks = 0;
};

export const startEmailWorker = (): void => {
  if (timer) return;

  // Emitted before the early return below, so "why did no mail arrive?" is
  // answerable from the boot log whether the transport or the worker is the
  // thing that is switched off.
  logMailTransportStatus();

  if (!env.email.workerEnabled) {
    console.warn("[mail] EMAIL_WORKER_ENABLED=false - queued emails will not be processed by this process.");
    return;
  }
  const provider = getEmailProvider();
  heartbeat.started = true;
  timer = setInterval(() => {
    inFlightTick = inFlightTick.then(() =>
      runWorkerTick(provider, env.email.workerBatchSize, env.email.workerStuckJobMinutes)
        .then((claimed) => {
          heartbeat.lastTickAt = new Date();
          heartbeat.lastTickClaimed = claimed;
          heartbeat.lastTickError = null;
          heartbeat.ticks += 1;
          return claimed;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[email-worker] tick failed", message);
          heartbeat.lastTickAt = new Date();
          heartbeat.lastTickClaimed = null;
          heartbeat.lastTickError = message;
          heartbeat.ticks += 1;
          return 0;
        })
    );
  }, env.email.workerPollIntervalMs);
  timer.unref?.();
  console.info("[email-worker] started", { pollIntervalMs: env.email.workerPollIntervalMs, provider: provider.name });
};

export const stopEmailWorker = async (): Promise<void> => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  heartbeat.started = false;
  await inFlightTick;
};
