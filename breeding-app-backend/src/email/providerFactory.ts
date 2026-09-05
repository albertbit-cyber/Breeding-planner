import { env } from "../config/env";
import type { EmailProvider } from "./provider";
import { MockEmailProvider } from "./providers/mockProvider";
import { ResendEmailProvider } from "./providers/resendProvider";
import { SmtpEmailProvider } from "./providers/smtpProvider";

let cachedProvider: EmailProvider | null = null;

const buildFromAddress = (): string => {
  const name = env.email.fromName.trim();
  const address = env.email.fromAddress.trim();
  return name ? `${name} <${address}>` : address;
};

export type MailTransportDescription = {
  transport: "resend" | "smtp" | "mock";
  /** False whenever mail will not actually leave the process. */
  configured: boolean;
  /** Short `key=value` summary for the boot line — never includes credentials. */
  detail: string;
  /** Why it is unconfigured, when it is. */
  reason?: string;
};

/**
 * Describes the transport that `createEmailProvider()` would build, without
 * building it. The boot line and the dev fallback both need this answer before
 * any mail is queued, and neither should pay for (or risk) provider construction.
 */
export const describeMailTransport = (): MailTransportDescription => {
  if (!env.email.enabled) {
    return {
      transport: "mock",
      configured: false,
      detail: 'EMAIL_ENABLED is not "true"',
      reason: "EMAIL_ENABLED is not set to \"true\", so the in-memory mock provider is used and no mail is sent.",
    };
  }

  if (env.email.provider === "resend") {
    const configured = Boolean(env.email.resendApiKey);
    return {
      transport: "resend",
      configured,
      detail: `from=${env.email.fromAddress}`,
      reason: configured ? undefined : "RESEND_API_KEY is empty.",
    };
  }

  if (env.email.provider === "smtp") {
    const configured = Boolean(env.email.smtp.host);
    return {
      transport: "smtp",
      configured,
      detail: `host=${env.email.smtp.host || "<unset>"}:${env.email.smtp.port} secure=${env.email.smtp.secure} from=${env.email.fromAddress}`,
      reason: configured ? undefined : "SMTP_HOST is empty.",
    };
  }

  return {
    transport: "mock",
    configured: false,
    detail: `EMAIL_PROVIDER=${env.email.provider}`,
    reason: `EMAIL_PROVIDER="${env.email.provider}" is not a real transport (expected "resend" or "smtp").`,
  };
};

/**
 * Single line, emitted once at boot, answering "will verification emails
 * actually be delivered?" without anyone having to read the config. A silent
 * mock transport is exactly the failure this is here to make obvious.
 */
export const logMailTransportStatus = (): MailTransportDescription => {
  const description = describeMailTransport();
  if (description.configured) {
    console.info(`[mail] transport=${description.transport} ${description.detail} configured=true`);
  } else {
    console.warn(
      `[mail] NO TRANSPORT CONFIGURED - verification emails will not be sent (${description.reason})`
    );
    if (env.nodeEnv !== "production") {
      console.warn(
        "[mail][dev] verification links will be printed to this console instead. " +
          "For real local mail run: docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit " +
          "and set EMAIL_ENABLED=true EMAIL_PROVIDER=smtp SMTP_HOST=localhost SMTP_PORT=1025"
      );
    }
  }
  return description;
};

export const createEmailProvider = (): EmailProvider => {
  if (!env.email.enabled) {
    return new MockEmailProvider();
  }
  if (env.email.provider === "resend") {
    return new ResendEmailProvider(env.email.resendApiKey, buildFromAddress(), env.email.replyTo);
  }
  if (env.email.provider === "smtp") {
    return new SmtpEmailProvider(env.email.smtp, buildFromAddress(), env.email.replyTo);
  }
  return new MockEmailProvider();
};

/** Shared singleton used by the queue worker. Tests should construct their own provider instead. */
export const getEmailProvider = (): EmailProvider => {
  if (!cachedProvider) {
    cachedProvider = createEmailProvider();
  }
  return cachedProvider;
};

export const resetEmailProviderCache = (): void => {
  cachedProvider = null;
};
