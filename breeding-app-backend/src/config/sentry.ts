import * as Sentry from "@sentry/node";
import { env } from "./env";

let initialized = false;

// No-op unless SENTRY_DSN is set (see env.ts) — mirrors the email system's
// pattern of failing gracefully rather than requiring config that may not
// exist yet in every environment. Call once, as early as possible, from
// server.ts.
export const initSentry = (): void => {
  if (!env.sentry.dsn) {
    console.log("[sentry] SENTRY_DSN not set; error tracking disabled.");
    return;
  }
  Sentry.init({
    dsn: env.sentry.dsn,
    environment: env.sentry.environment,
    tracesSampleRate: env.sentry.tracesSampleRate,
  });
  initialized = true;
  console.log(`[sentry] error tracking enabled (environment=${env.sentry.environment}).`);
};

export const isSentryEnabled = (): boolean => initialized;

// Safe to call unconditionally — becomes a no-op when Sentry was never
// initialized, so call sites don't need to check isSentryEnabled() first.
export const captureException = (error: unknown, extra?: Record<string, unknown>): void => {
  if (!initialized) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
};
