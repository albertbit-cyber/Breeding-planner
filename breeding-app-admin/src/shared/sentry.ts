import * as Sentry from "@sentry/react";

let initialized = false;

// No-op unless VITE_SENTRY_DSN is set at build time — error tracking stays
// off until a real DSN is configured for a given deployment. Call once, as
// early as possible, from src/index.jsx.
export const initSentry = (): void => {
  // Plain import.meta.env.KEY, not (import.meta as any)?.env?.KEY - Vite's static
  // replacement doesn't recognise the optional-chaining form (see apiClient.ts's
  // own patchImportMetaEnv workaround for VITE_API_URL), so the `?.` version here
  // silently evaluated to an empty string at runtime and initSentry() bailed out
  // via the `if (!dsn) return` below on every deploy, with no error and no clue
  // beyond "Sentry never receives anything."
  // Cast only `import.meta` itself (erased entirely by TS, so the emitted JS is
  // plain `import.meta.env.KEY` - the exact shape Vite's static replacement needs)
  // instead of using `?.` anywhere, which survives compilation as real
  // optional-chaining JS and is what broke the replacement in the first place.
  // This app's tsconfig doesn't pull in vite/client's ImportMetaEnv typing, so a
  // cast is still needed to satisfy TS - just not one that changes the emitted JS.
  const dsn = String((import.meta as any).env.VITE_SENTRY_DSN || "").trim();
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: String((import.meta as any).env.VITE_SENTRY_ENVIRONMENT || (import.meta as any).env.MODE || "production"),
    tracesSampleRate: 0.1,
  });
  initialized = true;
};

export const isSentryEnabled = (): boolean => initialized;
