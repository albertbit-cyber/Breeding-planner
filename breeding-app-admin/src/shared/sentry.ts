import * as Sentry from "@sentry/react";

let initialized = false;

// No-op unless VITE_SENTRY_DSN is set at build time — error tracking stays
// off until a real DSN is configured for a given deployment. Call once, as
// early as possible, from src/index.jsx.
export const initSentry = (): void => {
  const dsn = String((import.meta as any)?.env?.VITE_SENTRY_DSN || "").trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: String((import.meta as any)?.env?.VITE_SENTRY_ENVIRONMENT || (import.meta as any)?.env?.MODE || "production"),
    tracesSampleRate: 0.1,
  });
  initialized = true;
};

export const isSentryEnabled = (): boolean => initialized;
