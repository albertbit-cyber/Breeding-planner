// Provider-neutral email domain contracts. Nothing in this file may import
// the Resend SDK or any other provider package.

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  tags?: Record<string, string>;
  idempotencyKey?: string;
};

export type EmailSendResult = {
  provider: string;
  providerMessageId: string;
};

export type EmailErrorCode =
  | "configuration_error"
  | "validation_error"
  | "rendering_error"
  | "suppressed_recipient"
  | "retryable_provider_error"
  | "permanent_provider_error";

export class EmailError extends Error {
  public readonly code: EmailErrorCode;
  public readonly retryable: boolean;
  /**
   * Raw provider diagnostics (SMTP response line, Resend error body, ...).
   * Carried so failures can be logged in full without the log site needing to
   * know which provider produced them. Never surfaced in an HTTP response.
   */
  public readonly details?: unknown;

  constructor(code: EmailErrorCode, message: string, retryable: boolean, details?: unknown) {
    super(message);
    this.name = "EmailError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export class EmailConfigurationError extends EmailError {
  constructor(message: string, details?: unknown) {
    super("configuration_error", message, false, details);
    this.name = "EmailConfigurationError";
  }
}

export class EmailValidationError extends EmailError {
  constructor(message: string, details?: unknown) {
    super("validation_error", message, false, details);
    this.name = "EmailValidationError";
  }
}

export class EmailRenderingError extends EmailError {
  constructor(message: string, details?: unknown) {
    super("rendering_error", message, false, details);
    this.name = "EmailRenderingError";
  }
}

export class SuppressedRecipientError extends EmailError {
  constructor(message: string, details?: unknown) {
    super("suppressed_recipient", message, false, details);
    this.name = "SuppressedRecipientError";
  }
}

export class RetryableProviderError extends EmailError {
  constructor(message: string, details?: unknown) {
    super("retryable_provider_error", message, true, details);
    this.name = "RetryableProviderError";
  }
}

export class PermanentProviderError extends EmailError {
  constructor(message: string, details?: unknown) {
    super("permanent_provider_error", message, false, details);
    this.name = "PermanentProviderError";
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmailAddress = (value: string): string => String(value || "").trim().toLowerCase();

export const isValidEmailAddress = (value: string): boolean => EMAIL_PATTERN.test(normalizeEmailAddress(value));

export const assertValidEmailAddress = (value: string): string => {
  const normalized = normalizeEmailAddress(value);
  if (!isValidEmailAddress(normalized)) {
    throw new EmailValidationError(`Invalid recipient email address: "${value}"`);
  }
  return normalized;
};
