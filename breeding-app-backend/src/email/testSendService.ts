import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { HttpError } from "../utils/errors";
import { maskEmail } from "../utils/maskEmail";
import { createEmailProvider, describeMailTransport } from "./providerFactory";
import { EmailError } from "./types";
import { logEmailAttempt } from "./sendLog";

const db = prisma as any;

export type TestSendResult = {
  ok: boolean;
  transport: string;
  recipient: string;
  providerMessageId?: string;
  /** Present only on failure — the provider's own classification and message. */
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  /** What the operator should do about it. */
  interpretation: string;
};

const TEST_SUBJECT = "Serpentora mail delivery test";

const TEST_TEXT = [
  "This is a delivery test sent from the Serpentora admin console.",
  "",
  "If you are reading this, the backend can send mail through its configured",
  "transport and account verification emails will reach this address.",
].join("\n");

const TEST_HTML = [
  "<p>This is a delivery test sent from the Serpentora admin console.</p>",
  "<p>If you are reading this, the backend can send mail through its configured transport",
  "and account verification emails will reach this address.</p>",
].join("\n");

/**
 * Turns a raw provider failure into the operator's next action. The mapping is
 * deliberately opinionated: an unverified sending domain and a missing API key
 * produce very different-looking errors that both surface as "no mail arrived".
 */
const interpretFailure = (code: string, message: string): string => {
  const text = `${code} ${message}`.toLowerCase();

  if (text.includes("domain is not verified") || text.includes("not verified")) {
    return "The sending domain is not verified with the provider. Until it is, sends to anyone other than the provider account owner are rejected — which is exactly the symptom of 'only I receive the email'.";
  }
  if (text.includes("api key") || text.includes("unauthorized") || text.includes("401") || text.includes("invalid_access")) {
    return "The provider rejected the credentials. Check RESEND_API_KEY on the backend service — a rotated or truncated key looks like this.";
  }
  if (text.includes("configuration")) {
    return "The transport is not fully configured. Check EMAIL_ENABLED, EMAIL_PROVIDER and the provider's own variables.";
  }
  if (text.includes("from") || text.includes("sender")) {
    return "The provider rejected the From address. EMAIL_FROM_ADDRESS must be on a domain verified for this provider account.";
  }
  if (text.includes("rate limit")) {
    return "The provider is rate limiting this account. Retry shortly; real sends will be retried automatically by the queue.";
  }
  if (text.includes("econnrefused") || text.includes("enotfound") || text.includes("etimedout")) {
    return "The provider host could not be reached from this server. Check SMTP_HOST/SMTP_PORT and that outbound connections are permitted.";
  }
  return "The provider rejected this message. The verbatim error above is the authoritative reason.";
};

/**
 * Sends one real message through the live transport, bypassing the queue.
 *
 * Bypassing the queue is the point: a queued send records its failure on a job
 * row and returns success to the caller, so an operator testing configuration
 * learns nothing. This surfaces the provider's actual response synchronously.
 */
export const sendDiagnosticTestEmail = async (recipient: string, adminUserId: string): Promise<TestSendResult> => {
  const address = recipient.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new HttpError(400, "recipient must be a valid email address.");
  }

  const transport = describeMailTransport();
  if (!transport.configured) {
    return {
      ok: false,
      transport: transport.transport,
      recipient: maskEmail(address),
      errorCode: "transport_unconfigured",
      errorMessage: transport.reason || "No mail transport is configured.",
      retryable: false,
      interpretation:
        "Nothing was sent because this process has no real transport. Set EMAIL_ENABLED=\"true\" and the provider variables, then redeploy.",
    };
  }

  // A test send names a real person's address in an audit trail, so it is
  // recorded like any other admin action against a user.
  await db.adminAuditLog.create({
    data: {
      adminUserId,
      action: "email_test_send",
      beforeJson: { transport: transport.transport },
      afterJson: { recipient: maskEmail(address) },
      reason: "Mail delivery diagnostic",
    },
  });

  try {
    // Constructed inside the try: a provider constructor validates its own
    // configuration and throws, and that throw is a diagnosis worth reporting
    // rather than a 500 from the endpoint whose job is to diagnose.
    const provider = createEmailProvider();

    const result = await provider.send({
      to: address,
      subject: TEST_SUBJECT,
      text: TEST_TEXT,
      html: TEST_HTML,
      tags: { category: "account_and_security", template: "admin_delivery_test" },
    });

    logEmailAttempt({
      jobId: "(diagnostic)",
      recipient: address,
      template: "admin_delivery_test",
      category: "account_and_security",
      outcome: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
    });

    return {
      ok: true,
      transport: result.provider,
      recipient: maskEmail(address),
      providerMessageId: result.providerMessageId,
      interpretation:
        result.provider === "mock"
          ? "Accepted by the mock transport, which discards mail. Nothing was actually delivered."
          : "The provider accepted this message. If it does not arrive, check the recipient's spam folder and the provider's own delivery log for a bounce.",
    };
  } catch (error) {
    const code = error instanceof EmailError ? error.code : "unknown_error";
    const message = error instanceof Error ? error.message : String(error);
    const retryable = error instanceof EmailError ? error.retryable : true;

    logEmailAttempt({
      jobId: "(diagnostic)",
      recipient: address,
      template: "admin_delivery_test",
      category: "account_and_security",
      outcome: "failed",
      provider: transport.transport,
      reason: code,
      error,
    });

    return {
      ok: false,
      transport: transport.transport,
      recipient: maskEmail(address),
      errorCode: code,
      // Safe to return: provider rejection text describes the sender's own
      // configuration, and this endpoint is already admin-only.
      errorMessage: env.nodeEnv === "production" ? message.slice(0, 500) : message,
      retryable,
      interpretation: interpretFailure(code, message),
    };
  }
};
