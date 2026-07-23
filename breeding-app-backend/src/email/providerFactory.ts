import { env } from "../config/env";
import type { EmailProvider } from "./provider";
import { MockEmailProvider } from "./providers/mockProvider";
import { ResendEmailProvider } from "./providers/resendProvider";

let cachedProvider: EmailProvider | null = null;

const buildFromAddress = (): string => {
  const name = env.email.fromName.trim();
  const address = env.email.fromAddress.trim();
  return name ? `${name} <${address}>` : address;
};

export const createEmailProvider = (): EmailProvider => {
  if (!env.email.enabled) {
    return new MockEmailProvider();
  }
  if (env.email.provider === "resend") {
    return new ResendEmailProvider(env.email.resendApiKey, buildFromAddress(), env.email.replyTo);
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
