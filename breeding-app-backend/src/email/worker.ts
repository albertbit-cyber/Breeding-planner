import { env } from "../config/env";
import type { EmailProvider } from "./provider";
import { getEmailProvider } from "./providerFactory";
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

/** Processes exactly one already-claimed (status=processing) job. Never throws — every failure path updates the job row instead. */
export const processEmailJob = async (job: any, provider: EmailProvider): Promise<void> => {
  const category = job.category as NotificationCategory;

  try {
    if (!REQUIRED_CATEGORIES.has(category)) {
      const enabled = await isCategoryEnabled(job.ownerId, category);
      if (!enabled) {
        await markCancelledBySystem(job.id, "Recipient has disabled this notification category.");
        return;
      }

      const suppressed = await isRecipientSuppressed(job.recipientEmail);
      if (suppressed) {
        await markSuppressed(job.id);
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
    console.info("[email-worker] sent", { jobId: job.id, ownerId: job.ownerId, category });
  } catch (error) {
    if (error instanceof EmailError) {
      if (error.retryable) {
        await scheduleRetry(job.id, error.code, error.message);
        console.warn("[email-worker] retryable failure", { jobId: job.id, ownerId: job.ownerId, code: error.code });
      } else {
        await markPermanentFailure(job.id, error.code, error.message);
        console.error("[email-worker] permanent failure", { jobId: job.id, ownerId: job.ownerId, code: error.code });
      }
      return;
    }

    // Unexpected/unknown errors are treated as retryable so a transient bug
    // doesn't strand a job forever, but they still count against maximumAttempts.
    const message = error instanceof Error ? error.message : "Unknown error";
    await scheduleRetry(job.id, "unknown_error", message);
    console.error("[email-worker] unexpected error", { jobId: job.id, ownerId: job.ownerId, message });
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

export const startEmailWorker = (): void => {
  if (!env.email.workerEnabled || timer) return;
  const provider = getEmailProvider();
  timer = setInterval(() => {
    inFlightTick = inFlightTick.then(() =>
      runWorkerTick(provider, env.email.workerBatchSize, env.email.workerStuckJobMinutes).catch((error) => {
        console.error("[email-worker] tick failed", error instanceof Error ? error.message : error);
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
  await inFlightTick;
};
