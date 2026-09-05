import { env } from "../config/env";
import { maskEmail } from "../utils/maskEmail";
import { EmailError } from "./types";

export type EmailSendOutcome = "sent" | "skipped" | "failed";

export type EmailAttemptLog = {
  jobId: string;
  recipient: string;
  template: string;
  category?: string;
  outcome: EmailSendOutcome;
  /** Transport that handled it — "mock" here means nothing was delivered. */
  provider?: string;
  providerMessageId?: string;
  /** Why a send was skipped, or the classified error code when it failed. */
  reason?: string;
  error?: unknown;
  attempt?: number;
  willRetry?: boolean;
};

/**
 * Server logs are the only place a delivery failure can be seen — the HTTP
 * response is deliberately generic — so the address has to be here. Outside
 * production it is printed in full, because "which of my test accounts was
 * that?" is the whole question a developer is asking. In production it is
 * masked: still enough to correlate against a support ticket, without writing
 * user addresses into log aggregation.
 */
const logRecipient = (email: string): string =>
  env.nodeEnv === "production" ? maskEmail(email) : email;

/** Flattens any thrown value into something a log line can carry in full. */
const describeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof EmailError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      // The provider's own response: SMTP reply line, Resend error body, etc.
      response: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      code: (error as { code?: string }).code || error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
};

/**
 * One structured line per attempted send. Emitted on every outcome, including
 * the ones that used to be invisible: a mock "send" that delivered nothing, and
 * a provider error that the queue swallowed into a job row.
 */
export const logEmailAttempt = (entry: EmailAttemptLog): void => {
  const line: Record<string, unknown> = {
    jobId: entry.jobId,
    recipient: logRecipient(entry.recipient),
    template: entry.template,
    outcome: entry.outcome,
  };
  if (entry.category) line.category = entry.category;
  if (entry.provider) line.provider = entry.provider;
  if (entry.providerMessageId) line.providerMessageId = entry.providerMessageId;
  if (entry.reason) line.reason = entry.reason;
  if (typeof entry.attempt === "number") line.attempt = entry.attempt;
  if (typeof entry.willRetry === "boolean") line.willRetry = entry.willRetry;
  if (entry.error !== undefined) line.error = describeError(entry.error);

  if (entry.outcome === "failed") {
    console.error("[mail] send failed", line);
    return;
  }
  if (entry.outcome === "skipped") {
    console.warn("[mail] send skipped", line);
    return;
  }

  // A "sent" through the mock provider is a non-delivery. Say so at warn level
  // rather than letting it read like a successful send.
  if (entry.provider === "mock") {
    console.warn("[mail] send NOT delivered (mock transport - no mail leaves this process)", line);
    return;
  }
  console.info("[mail] sent", line);
};

const TEMPLATE_LINK_LABELS: Record<string, string> = {
  account_email_verification: "verification link",
  account_password_reset: "password reset link",
  account_verify_new_email: "email change confirmation link",
};

/**
 * Development escape hatch: with no real transport configured, print the link
 * the email would have contained so local signup/verification is not blocked.
 *
 * Hard-guarded on NODE_ENV — a token in a production log is a credential leak,
 * and this must never be reachable there under any configuration.
 */
export const logDevActionLink = (job: {
  id?: string;
  recipientEmail: string;
  templateKey: string;
  templatePayload?: unknown;
}): void => {
  if (env.nodeEnv === "production") return;

  const payload = (job.templatePayload || {}) as Record<string, unknown>;
  const actionUrl = typeof payload.actionUrl === "string" ? payload.actionUrl : "";
  if (!actionUrl) return;

  const label = TEMPLATE_LINK_LABELS[job.templateKey] || `${job.templateKey} link`;
  console.warn(`[mail][dev] ${label} for ${job.recipientEmail}: ${actionUrl}`);
};
