import nodemailer, { type Transporter } from "nodemailer";
import type { EmailProvider } from "../provider";
import type { EmailMessage, EmailSendResult } from "../types";
import {
  EmailConfigurationError,
  PermanentProviderError,
  RetryableProviderError,
  assertValidEmailAddress,
} from "../types";

export type SmtpProviderOptions = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
};

// Connection-level failures that mean "the server wasn't reachable this time",
// not "this message is bad". Always worth another attempt.
const RETRYABLE_SMTP_ERROR_CODES = new Set([
  "ECONNECTION",
  "ECONNREFUSED",
  "ECONNRESET",
  "EDNS",
  "ESOCKET",
  "ETIMEDOUT",
  "ETLS",
]);

type NodemailerError = Error & {
  code?: string;
  responseCode?: number;
  response?: string;
  command?: string;
};

const asNodemailerError = (error: unknown): NodemailerError =>
  error instanceof Error ? (error as NodemailerError) : (new Error(String(error)) as NodemailerError);

/** Everything the provider knew about a failure, kept verbatim for the send log. */
const errorDetails = (error: NodemailerError) => ({
  code: error.code,
  responseCode: error.responseCode,
  response: error.response,
  command: error.command,
});

/**
 * Generic SMTP transport (nodemailer). Its reason for existing is local
 * development against a catch-all like Mailpit — `docker run -d -p 1025:1025
 * -p 8025:8025 axllent/mailpit`, then SMTP_HOST=localhost SMTP_PORT=1025 —
 * so a developer can see real rendered mail without a provider account. It is
 * a fully functional transport, though, and works against any SMTP relay.
 */
export class SmtpEmailProvider implements EmailProvider {
  public readonly name = "smtp";
  private readonly transporter: Transporter;
  private readonly defaultFrom: string;
  private readonly defaultReplyTo: string;

  constructor(options: SmtpProviderOptions, defaultFrom: string, defaultReplyTo = "") {
    if (!options.host) {
      throw new EmailConfigurationError("SMTP_HOST is not configured.");
    }
    if (!defaultFrom) {
      throw new EmailConfigurationError("A default from address is not configured.");
    }
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      // Mailpit and most local catch-alls accept unauthenticated connections;
      // only pass credentials when both halves are actually present.
      auth: options.user && options.password ? { user: options.user, pass: options.password } : undefined,
    });
    this.defaultFrom = defaultFrom;
    this.defaultReplyTo = defaultReplyTo;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const to = assertValidEmailAddress(message.to);

    // SMTP has no idempotency primitive, so the key rides along as a header —
    // enough to correlate a duplicate in Mailpit or a relay's logs.
    const headers: Record<string, string> = {};
    if (message.idempotencyKey) headers["X-Idempotency-Key"] = message.idempotencyKey;
    for (const [name, value] of Object.entries(message.tags || {})) {
      headers[`X-Tag-${name}`] = String(value);
    }

    let info;
    try {
      info = await this.transporter.sendMail({
        from: message.from || this.defaultFrom,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo || this.defaultReplyTo || undefined,
        headers,
      });
    } catch (error) {
      const smtpError = asNodemailerError(error);
      const details = errorDetails(smtpError);
      const reason = `SMTP send failed: ${smtpError.message}`;

      // A 4xx SMTP reply is an explicit "try again later"; 5xx is a refusal.
      if (typeof smtpError.responseCode === "number") {
        throw smtpError.responseCode >= 500
          ? new PermanentProviderError(reason, details)
          : new RetryableProviderError(reason, details);
      }
      throw RETRYABLE_SMTP_ERROR_CODES.has(String(smtpError.code))
        ? new RetryableProviderError(reason, details)
        : new PermanentProviderError(reason, details);
    }

    // The server answered but refused this recipient — retrying changes nothing.
    if (Array.isArray(info.rejected) && info.rejected.length) {
      throw new PermanentProviderError(`SMTP server rejected recipient(s): ${info.rejected.join(", ")}`, {
        rejected: info.rejected,
        response: info.response,
      });
    }

    if (!info.messageId) {
      throw new RetryableProviderError("SMTP response did not include a message id.", { response: info.response });
    }

    return { provider: this.name, providerMessageId: info.messageId };
  }
}
