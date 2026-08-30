import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL", "JWT_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const nodeEnv = process.env.NODE_ENV || "development";
const emailEnabled = String(process.env.EMAIL_ENABLED || "false").trim().toLowerCase() === "true";
const emailProvider = (process.env.EMAIL_PROVIDER || "resend").trim().toLowerCase();

// Fail loudly at startup if email sending is turned on without the config it needs.
// This must never be silently downgraded to a working state — a missing key here
// means production would otherwise try to send through an unconfigured provider.
if (emailEnabled && emailProvider === "resend") {
  const emailRequired = ["RESEND_API_KEY", "EMAIL_FROM_NAME", "EMAIL_FROM_ADDRESS"] as const;
  const missing = emailRequired.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `EMAIL_ENABLED=true but missing required email environment variable(s): ${missing.join(", ")}`
    );
  }
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL as string,
  jwtSecret: process.env.JWT_SECRET as string,
  corsOrigin: process.env.CORS_ORIGIN || "",
  email: {
    enabled: emailEnabled,
    provider: emailProvider as "resend" | "mock",
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || "",
    fromName: process.env.EMAIL_FROM_NAME || "Serpentora",
    fromAddress: process.env.EMAIL_FROM_ADDRESS || "notifications@serpentora.com",
    replyTo: process.env.EMAIL_REPLY_TO || "",
    workerEnabled: String(process.env.EMAIL_WORKER_ENABLED ?? "true").trim().toLowerCase() === "true",
    workerPollIntervalMs: Number(process.env.EMAIL_WORKER_POLL_INTERVAL_MS || 15_000),
    workerBatchSize: Number(process.env.EMAIL_WORKER_BATCH_SIZE || 10),
    workerStuckJobMinutes: Number(process.env.EMAIL_WORKER_STUCK_JOB_MINUTES || 10),
  },
  publicAppUrl: (process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || "").split(",")[0].trim(),
  // The Lab Portal is a separate deployment from the breeder app, so links sent
  // to vendor labs (invitations above all) must not be built from
  // `publicAppUrl` — that would drop an invited lab on the breeder sign-in page.
  // Falls back to it only so a single-origin dev setup keeps working.
  labPortalUrl: (process.env.LAB_PORTAL_URL || process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || "")
    .split(",")[0]
    .trim(),
  // "lax" is correct once every frontend reaches the backend through a same-origin
  // proxy (see docs/architecture/saas-implementation-plan.md Phase 0.5). Only set
  // this to "none" for an environment that still talks to the backend cross-origin
  // and needs cookie auth to keep working during the proxy rollout — bearer-token
  // auth (the current default everywhere) is unaffected either way.
  authCookieSameSite: (process.env.AUTH_COOKIE_SAMESITE || "lax").trim().toLowerCase() as "lax" | "none" | "strict",
  sentry: {
    // Unset by default — error tracking stays off until a real DSN is provided.
    // No SENTRY_DSN means initSentry() (src/config/sentry.ts) is a no-op.
    dsn: process.env.SENTRY_DSN || "",
    environment: process.env.SENTRY_ENVIRONMENT || nodeEnv,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  },
};
