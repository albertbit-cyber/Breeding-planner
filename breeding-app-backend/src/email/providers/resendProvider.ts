import { Resend } from "resend";
import type { EmailProvider } from "../provider";
import type { EmailMessage, EmailSendResult } from "../types";
import {
  EmailConfigurationError,
  PermanentProviderError,
  RetryableProviderError,
  assertValidEmailAddress,
} from "../types";

// Resend error names that indicate a transient failure worth retrying.
// Everything else (bad payload, invalid key, invalid sender/recipient) is permanent.
const RETRYABLE_RESEND_ERROR_NAMES = new Set([
  "rate_limit_exceeded",
  "internal_server_error",
  "application_error",
  "concurrent_idempotent_requests",
]);

export class ResendEmailProvider implements EmailProvider {
  public readonly name = "resend";
  private readonly client: Resend;
  private readonly defaultFrom: string;
  private readonly defaultReplyTo: string;

  constructor(apiKey: string, defaultFrom: string, defaultReplyTo = "") {
    if (!apiKey) {
      throw new EmailConfigurationError("RESEND_API_KEY is not configured.");
    }
    if (!defaultFrom) {
      throw new EmailConfigurationError("A default from address is not configured.");
    }
    this.client = new Resend(apiKey);
    this.defaultFrom = defaultFrom;
    this.defaultReplyTo = defaultReplyTo;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const to = assertValidEmailAddress(message.to);
    const replyTo = message.replyTo || this.defaultReplyTo || undefined;

    let response;
    try {
      response = await this.client.emails.send(
        {
          from: message.from || this.defaultFrom,
          to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo,
          tags: message.tags
            ? Object.entries(message.tags).map(([name, value]) => ({ name, value: String(value) }))
            : undefined,
        },
        message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
      );
    } catch (error) {
      // Network-level failure (DNS, timeout, connection reset) — always retryable.
      const reason = error instanceof Error ? error.message : "Unknown network error";
      throw new RetryableProviderError(`Resend request failed: ${reason}`);
    }

    if (response.error) {
      const { name, message: providerMessage } = response.error;
      if (RETRYABLE_RESEND_ERROR_NAMES.has(name)) {
        throw new RetryableProviderError(`Resend error (${name}): ${providerMessage}`);
      }
      throw new PermanentProviderError(`Resend error (${name}): ${providerMessage}`);
    }

    if (!response.data?.id) {
      throw new RetryableProviderError("Resend response did not include a message id.");
    }

    return { provider: this.name, providerMessageId: response.data.id };
  }
}
