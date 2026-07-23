import { createHmac, timingSafeEqual } from "crypto";
import { findJobByProviderMessageId, applyWebhookStatus, recordEvent, type EmailJobStatus } from "./queueService";
import { suppressRecipient } from "./suppressionService";

const REPLAY_TOLERANCE_SECONDS = 5 * 60;

export type ResendWebhookHeaders = {
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
};

/**
 * Verifies a Resend (Svix-format) webhook signature against the raw request
 * body. Must be called with the exact bytes Resend sent — never a
 * re-serialized/parsed copy — or every signature will fail to verify.
 */
export const verifyResendWebhookSignature = (
  rawBody: string,
  headers: ResendWebhookHeaders,
  secret: string
): boolean => {
  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature || !secret) return false;

  const timestampSeconds = Number(headers.svixTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > REPLAY_TOLERANCE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest();

  const candidates = headers.svixSignature.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const [version, signature] = candidate.split(",");
    if (version !== "v1" || !signature) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, "base64");
    } catch {
      continue;
    }
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
};

const EVENT_STATUS_MAP: Record<string, { status: EmailJobStatus; timestampField: "sentAt" | "deliveredAt" | "failedAt" | null }> = {
  "email.sent": { status: "provider_accepted", timestampField: "sentAt" },
  "email.delivered": { status: "delivered", timestampField: "deliveredAt" },
  "email.delivery_delayed": { status: "delivery_delayed", timestampField: null },
  "email.bounced": { status: "bounced", timestampField: "failedAt" },
  "email.complained": { status: "complained", timestampField: "failedAt" },
  "email.failed": { status: "failed", timestampField: "failedAt" },
};

export type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: { email_id?: string; [key: string]: unknown };
};

export type WebhookProcessResult =
  | { outcome: "ignored_unknown_event_type" }
  | { outcome: "ignored_unknown_message_id" }
  | { outcome: "duplicate" }
  | { outcome: "applied"; status: EmailJobStatus };

/**
 * Processes one verified Resend webhook event. Never trusts the recipient or
 * organization identity from the payload — the email job (and therefore its
 * owner) is only ever resolved via the provider message id we stored when we
 * sent the email.
 */
export const processResendWebhookEvent = async (
  svixId: string,
  payload: ResendWebhookPayload
): Promise<WebhookProcessResult> => {
  const mapping = EVENT_STATUS_MAP[payload.type];
  if (!mapping) return { outcome: "ignored_unknown_event_type" };

  const providerMessageId = payload.data?.email_id;
  if (!providerMessageId) return { outcome: "ignored_unknown_message_id" };

  const job = await findJobByProviderMessageId(providerMessageId);
  if (!job) return { outcome: "ignored_unknown_message_id" };

  const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();
  const { created } = await recordEvent(job.id, svixId, payload.type, occurredAt, { type: payload.type });
  if (!created) return { outcome: "duplicate" };

  await applyWebhookStatus(job.id, mapping.status, mapping.timestampField);

  if (payload.type === "email.bounced") {
    await suppressRecipient(job.recipientEmail, "hard_bounce", "webhook");
  }
  if (payload.type === "email.complained") {
    await suppressRecipient(job.recipientEmail, "complaint", "webhook");
  }

  return { outcome: "applied", status: mapping.status };
};
