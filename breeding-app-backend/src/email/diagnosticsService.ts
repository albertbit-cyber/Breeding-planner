import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { maskEmail } from "../utils/maskEmail";
import { describeMailTransport, type MailTransportDescription } from "./providerFactory";
import { getEmailWorkerHeartbeat, type EmailWorkerHeartbeat } from "./worker";

const db = prisma as any;

/** Statuses a job sits in while it is still waiting for this process to act on it. */
const UNSENT_STATUSES = ["pending", "processing"] as const;

export type MailDiagnosticsProblem = {
  /** Stable identifier so the UI can key off it rather than the prose. */
  code:
    | "transport_unconfigured"
    | "worker_disabled"
    | "worker_not_ticking"
    | "worker_tick_failing"
    | "queue_backlog"
    | "recent_failures"
    | "public_app_url_unset"
    | "public_app_url_local"
    | "from_domain_mismatch";
  severity: "critical" | "warning";
  /** Plain-language statement of what is wrong. */
  summary: string;
  /** The specific change that fixes it. */
  remedy: string;
};

export type MailDiagnostics = {
  checkedAt: string;
  environment: string;
  transport: MailTransportDescription;
  sender: {
    fromName: string;
    fromAddress: string;
    fromDomain: string;
    replyTo: string | null;
  };
  links: {
    /** Host that verification and reset links point at. A wrong value here means mail arrives but the link is dead. */
    publicAppUrl: string;
    verifyEmailExample: string;
    resetPasswordExample: string;
  };
  worker: {
    enabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    stuckJobMinutes: number;
    heartbeat: EmailWorkerHeartbeat;
    secondsSinceLastTick: number | null;
  };
  queue: {
    countsByStatus: Record<string, number>;
    totalUnsent: number;
    oldestPendingAgeSeconds: number | null;
    recentFailures: Array<{
      id: string;
      templateKey: string;
      recipient: string;
      status: string;
      attemptCount: number;
      lastErrorCode: string | null;
      lastErrorMessage: string | null;
      failedAt: Date | null;
      createdAt: Date;
    }>;
  };
  problems: MailDiagnosticsProblem[];
  /** One sentence answering "will a verification email actually arrive right now?" */
  verdict: string;
};

const domainOf = (address: string): string => {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/** True when the From domain and the app host belong to the same registrable domain. */
const sharesRegistrableDomain = (fromDomain: string, appHost: string): boolean => {
  const bare = appHost.replace(/^www\./, "");
  return fromDomain === bare || fromDomain.endsWith(`.${bare}`) || bare.endsWith(`.${fromDomain}`);
};

/**
 * Collects everything needed to answer "why did no verification email arrive?"
 * in a single request. Every field is derived from configuration this process
 * actually loaded, never from what a deploy is assumed to have set — the whole
 * point is to catch the case where the two disagree.
 *
 * Deliberately carries no secrets: the API key and SMTP password are reported
 * only through the transport's `configured` flag, and recipients are masked.
 */
export const collectMailDiagnostics = async (): Promise<MailDiagnostics> => {
  const transport = describeMailTransport();
  const heartbeat = getEmailWorkerHeartbeat();
  const publicAppUrl = String(env.publicAppUrl || "").replace(/\/$/, "");

  const grouped = await db.emailJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const countsByStatus: Record<string, number> = {};
  for (const row of grouped) {
    countsByStatus[row.status] = row._count?._all ?? 0;
  }

  const oldestPending = await db.emailJob.findFirst({
    where: { status: { in: [...UNSENT_STATUSES] } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const recentFailures = await db.emailJob.findMany({
    where: { status: { in: ["failed", "bounced"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      templateKey: true,
      recipientEmail: true,
      status: true,
      attemptCount: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      failedAt: true,
      createdAt: true,
    },
  });

  const now = Date.now();
  const totalUnsent = UNSENT_STATUSES.reduce((sum, status) => sum + (countsByStatus[status] || 0), 0);
  const secondsSinceLastTick = heartbeat.lastTickAt
    ? Math.round((now - new Date(heartbeat.lastTickAt).getTime()) / 1000)
    : null;
  const oldestPendingAgeSeconds = oldestPending
    ? Math.round((now - new Date(oldestPending.createdAt).getTime()) / 1000)
    : null;

  const fromAddress = env.email.fromAddress.trim();
  const fromDomain = domainOf(fromAddress);
  const publicHost = hostOf(publicAppUrl);
  const pollIntervalSeconds = Math.round(env.email.workerPollIntervalMs / 1000);

  const problems: MailDiagnosticsProblem[] = [];

  if (!transport.configured) {
    problems.push({
      code: "transport_unconfigured",
      severity: "critical",
      summary: `No mail transport is configured, so nothing is delivered. ${transport.reason || ""}`.trim(),
      remedy:
        'Set EMAIL_ENABLED="true" and EMAIL_PROVIDER="resend" (with RESEND_API_KEY, EMAIL_FROM_NAME and EMAIL_FROM_ADDRESS) on the backend service, then redeploy.',
    });
  }

  if (!env.email.workerEnabled) {
    problems.push({
      code: "worker_disabled",
      severity: "critical",
      summary: "EMAIL_WORKER_ENABLED is false, so queued mail is never picked up by this process.",
      remedy: 'Set EMAIL_WORKER_ENABLED="true" (or remove the variable — it defaults to true) and redeploy.',
    });
  } else if (!heartbeat.started) {
    problems.push({
      code: "worker_not_ticking",
      severity: "critical",
      summary: "The email worker has not started in this process.",
      remedy: "Check the boot log for a startEmailWorker() failure, then restart the service.",
    });
  } else if (secondsSinceLastTick !== null && secondsSinceLastTick > pollIntervalSeconds * 4) {
    problems.push({
      code: "worker_not_ticking",
      severity: "critical",
      summary: `The email worker last ran ${secondsSinceLastTick}s ago, far longer than its ${pollIntervalSeconds}s poll interval.`,
      remedy: "The polling loop is blocked or the process is stalled. Restart the service and watch for [email-worker] tick failed.",
    });
  }

  if (heartbeat.lastTickError) {
    problems.push({
      code: "worker_tick_failing",
      severity: "critical",
      summary: `The worker's last poll failed: ${heartbeat.lastTickError}`,
      remedy: "This is usually a database connectivity or schema problem. Check DATABASE_URL and that migrations have run.",
    });
  }

  // A handful of jobs mid-flight is normal; a backlog older than many poll
  // intervals means mail is being queued but never successfully sent.
  const backlogThresholdSeconds = Math.max(300, pollIntervalSeconds * 20);
  if (totalUnsent > 0 && oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds > backlogThresholdSeconds) {
    problems.push({
      code: "queue_backlog",
      severity: "warning",
      summary: `${totalUnsent} message(s) are still unsent, the oldest queued ${Math.round(oldestPendingAgeSeconds / 60)} minute(s) ago.`,
      remedy: "Mail is being queued but not delivered. Fix the transport or worker problems above, then retry the stuck jobs.",
    });
  }

  if (recentFailures.length > 0) {
    const codes = [...new Set(recentFailures.map((job: any) => job.lastErrorCode).filter(Boolean))];
    problems.push({
      code: "recent_failures",
      severity: "warning",
      summary: `${recentFailures.length} recent message(s) failed permanently${codes.length ? ` (${codes.join(", ")})` : ""}.`,
      remedy: "Read lastErrorMessage below — it carries the provider's own rejection text verbatim.",
    });
  }

  if (!publicAppUrl) {
    problems.push({
      code: "public_app_url_unset",
      severity: "critical",
      summary: "PUBLIC_APP_URL is not set, so verification and reset links are built with an empty host and cannot be opened.",
      remedy: 'Set PUBLIC_APP_URL to the address users actually visit, e.g. "https://serpentora.com".',
    });
  } else if (LOCAL_HOSTS.has(publicHost) && env.nodeEnv === "production") {
    problems.push({
      code: "public_app_url_local",
      severity: "critical",
      summary: `Verification links point at ${publicAppUrl}, which is a local address. Recipients cannot open them.`,
      remedy: 'Set PUBLIC_APP_URL on the production service to the public site address, e.g. "https://serpentora.com".',
    });
  }

  // Resend rejects a From address on a domain that is not verified for the
  // account. The mismatch is worth surfacing even when it is intentional.
  if (transport.transport === "resend" && fromDomain && publicHost && !sharesRegistrableDomain(fromDomain, publicHost)) {
    problems.push({
      code: "from_domain_mismatch",
      severity: "warning",
      summary: `Mail is sent from @${fromDomain} while the app is served from ${publicHost}. If @${fromDomain} is not a verified domain in Resend, every send is rejected.`,
      remedy: `Confirm ${fromDomain} is verified in the Resend dashboard, or change EMAIL_FROM_ADDRESS to an address on a domain that is.`,
    });
  }

  const critical = problems.filter((problem) => problem.severity === "critical");
  const verdict = critical.length
    ? `Mail will NOT be delivered: ${critical[0].summary}`
    : problems.length
      ? `Mail is configured and the worker is running, but there are ${problems.length} warning(s) to review.`
      : `Mail is configured (${transport.transport}) and the worker is running. Verification emails should be delivered.`;

  return {
    checkedAt: new Date().toISOString(),
    environment: env.nodeEnv,
    transport,
    sender: {
      fromName: env.email.fromName,
      fromAddress,
      fromDomain,
      replyTo: env.email.replyTo || null,
    },
    links: {
      publicAppUrl,
      verifyEmailExample: `${publicAppUrl}/verify-email?token=<token>`,
      resetPasswordExample: `${publicAppUrl}/reset-password?token=<token>`,
    },
    worker: {
      enabled: env.email.workerEnabled,
      pollIntervalMs: env.email.workerPollIntervalMs,
      batchSize: env.email.workerBatchSize,
      stuckJobMinutes: env.email.workerStuckJobMinutes,
      heartbeat,
      secondsSinceLastTick,
    },
    queue: {
      countsByStatus,
      totalUnsent,
      oldestPendingAgeSeconds,
      recentFailures: recentFailures.map((job: any) => ({
        id: job.id,
        templateKey: job.templateKey,
        recipient: maskEmail(job.recipientEmail),
        status: job.status,
        attemptCount: job.attemptCount,
        lastErrorCode: job.lastErrorCode,
        lastErrorMessage: job.lastErrorMessage,
        failedAt: job.failedAt,
        createdAt: job.createdAt,
      })),
    },
    problems,
    verdict,
  };
};
