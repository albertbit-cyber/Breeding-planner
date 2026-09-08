/**
 * Cover for the diagnostic that answers "why did no verification email
 * arrive?". The value of this endpoint is entirely in naming the *specific*
 * misconfiguration, so each test pins one root cause to the problem code an
 * operator would act on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const emailJob = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: { emailJob },
}));

const transport = vi.hoisted(() => ({
  current: {
    transport: "resend" as "resend" | "smtp" | "mock",
    configured: true,
    detail: "from=notifications@serpentora.com",
    reason: undefined as string | undefined,
  },
}));

vi.mock("../../email/providerFactory", () => ({
  describeMailTransport: () => transport.current,
}));

const heartbeat = vi.hoisted(() => ({
  current: {
    started: true,
    lastTickAt: new Date() as Date | null,
    lastTickClaimed: 0 as number | null,
    lastTickError: null as string | null,
    ticks: 12,
  },
}));

vi.mock("../../email/worker", () => ({
  getEmailWorkerHeartbeat: () => heartbeat.current,
}));

const envState = vi.hoisted(() => ({
  current: {
    nodeEnv: "production",
    publicAppUrl: "https://serpentora.com",
    email: {
      fromName: "Serpentora",
      fromAddress: "notifications@serpentora.com",
      replyTo: "support@serpentora.com",
      workerEnabled: true,
      workerPollIntervalMs: 15_000,
      workerBatchSize: 10,
      workerStuckJobMinutes: 10,
    },
  },
}));

vi.mock("../../config/env", () => ({
  get env() {
    return envState.current;
  },
}));

import { collectMailDiagnostics } from "../../email/diagnosticsService";

const codesOf = (result: Awaited<ReturnType<typeof collectMailDiagnostics>>) =>
  result.problems.map((problem) => problem.code);

describe("collectMailDiagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailJob.groupBy.mockResolvedValue([]);
    emailJob.findFirst.mockResolvedValue(null);
    emailJob.findMany.mockResolvedValue([]);

    transport.current = {
      transport: "resend",
      configured: true,
      detail: "from=notifications@serpentora.com",
      reason: undefined,
    };
    heartbeat.current = {
      started: true,
      lastTickAt: new Date(),
      lastTickClaimed: 0,
      lastTickError: null,
      ticks: 12,
    };
    envState.current = {
      nodeEnv: "production",
      publicAppUrl: "https://serpentora.com",
      email: {
        fromName: "Serpentora",
        fromAddress: "notifications@serpentora.com",
        replyTo: "support@serpentora.com",
        workerEnabled: true,
        workerPollIntervalMs: 15_000,
        workerBatchSize: 10,
        workerStuckJobMinutes: 10,
      },
    };
  });

  it("reports a healthy configuration with no problems", async () => {
    const result = await collectMailDiagnostics();

    expect(result.problems).toEqual([]);
    expect(result.verdict).toContain("should be delivered");
  });

  it("names an unconfigured transport as the critical problem", async () => {
    transport.current = {
      transport: "mock",
      configured: false,
      detail: 'EMAIL_ENABLED is not "true"',
      reason: 'EMAIL_ENABLED is not set to "true", so the in-memory mock provider is used and no mail is sent.',
    };

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("transport_unconfigured");
    expect(result.verdict).toMatch(/^Mail will NOT be delivered/);
    expect(result.problems[0].remedy).toContain("EMAIL_ENABLED");
  });

  it("flags a disabled worker even when the transport is fine", async () => {
    envState.current.email.workerEnabled = false;

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("worker_disabled");
    expect(result.verdict).toMatch(/^Mail will NOT be delivered/);
  });

  it("flags a worker that started but has stopped ticking", async () => {
    heartbeat.current.lastTickAt = new Date(Date.now() - 10 * 60_000);

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("worker_not_ticking");
  });

  it("surfaces the error from a failing worker tick", async () => {
    heartbeat.current.lastTickError = "Can't reach database server";

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("worker_tick_failing");
    expect(result.problems.some((problem) => problem.summary.includes("Can't reach database server"))).toBe(true);
  });

  it("treats production verification links pointing at localhost as critical", async () => {
    envState.current.publicAppUrl = "http://localhost:5173";

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("public_app_url_local");
  });

  it("treats an unset PUBLIC_APP_URL as critical", async () => {
    envState.current.publicAppUrl = "";

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("public_app_url_unset");
  });

  it("does not flag a from-domain that matches the app host", async () => {
    envState.current.publicAppUrl = "https://www.serpentora.com";

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).not.toContain("from_domain_mismatch");
  });

  it("warns when mail is sent from a domain unrelated to the app host", async () => {
    envState.current.email.fromAddress = "notifications@some-other-domain.com";

    const result = await collectMailDiagnostics();

    expect(codesOf(result)).toContain("from_domain_mismatch");
  });

  it("reports an aged backlog of unsent jobs", async () => {
    emailJob.groupBy.mockResolvedValue([
      { status: "pending", _count: { _all: 7 } },
      { status: "delivered", _count: { _all: 3 } },
    ]);
    emailJob.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60 * 60_000) });

    const result = await collectMailDiagnostics();

    expect(result.queue.totalUnsent).toBe(7);
    expect(codesOf(result)).toContain("queue_backlog");
  });

  it("masks recipients and keeps the provider's verbatim failure text", async () => {
    emailJob.findMany.mockResolvedValue([
      {
        id: "job-1",
        templateKey: "account_email_verification",
        recipientEmail: "someone@example.com",
        status: "failed",
        attemptCount: 5,
        lastErrorCode: "permanent_provider_error",
        lastErrorMessage: "Resend error (validation_error): The domain is not verified.",
        failedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    const result = await collectMailDiagnostics();

    expect(result.queue.recentFailures[0].recipient).not.toContain("someone@example.com");
    expect(result.queue.recentFailures[0].lastErrorMessage).toContain("domain is not verified");
    expect(codesOf(result)).toContain("recent_failures");
  });
});
