import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    emailJob: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    emailEvent: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma";
import {
  enqueueEmail,
  cancelByIdempotencyKey,
  cancelJob,
  claimNextBatch,
  recoverStuckJobs,
  scheduleRetry,
  markPermanentFailure,
  applyWebhookStatus,
  recordEvent,
} from "../../email/queueService";

const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enqueueEmail", () => {
  it("creates a new job", async () => {
    db.emailJob.create.mockResolvedValue({ id: "job-1" });
    const job = await enqueueEmail({
      ownerId: "user-1",
      recipientEmail: "USER@Example.com",
      category: "breeding_reminders",
      templateKey: "breeding_reminder",
      templateVersion: 1,
      templatePayload: {},
      subject: "Reminder",
      idempotencyKey: "key-1",
    });
    expect(job).toEqual({ id: "job-1" });
    expect(db.emailJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientEmail: "user@example.com", idempotencyKey: "key-1" }) })
    );
  });

  it("returns the existing job instead of throwing on a duplicate idempotency key", async () => {
    db.emailJob.create.mockRejectedValue({ code: "P2002" });
    db.emailJob.findUnique.mockResolvedValue({ id: "existing-job" });
    const job = await enqueueEmail({
      ownerId: "user-1",
      recipientEmail: "user@example.com",
      category: "breeding_reminders",
      templateKey: "breeding_reminder",
      templateVersion: 1,
      templatePayload: {},
      subject: "Reminder",
      idempotencyKey: "key-1",
    });
    expect(job).toEqual({ id: "existing-job" });
  });

  it("propagates non-uniqueness errors", async () => {
    db.emailJob.create.mockRejectedValue(new Error("connection lost"));
    await expect(enqueueEmail({
      ownerId: "user-1",
      recipientEmail: "user@example.com",
      category: "breeding_reminders",
      templateKey: "breeding_reminder",
      templateVersion: 1,
      templatePayload: {},
      subject: "Reminder",
      idempotencyKey: "key-1",
    })).rejects.toThrow("connection lost");
  });
});

describe("cancelByIdempotencyKey / cancelJob", () => {
  it("cancels a pending job", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "pending" });
    db.emailJob.update.mockResolvedValue({ id: "job-1", status: "cancelled" });
    const result = await cancelByIdempotencyKey("key-1");
    expect(result.status).toBe("cancelled");
    expect(db.emailJob.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "job-1" } }));
  });

  it("does not cancel a job already in a terminal state", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "delivered" });
    const result = await cancelByIdempotencyKey("key-1");
    expect(result.status).toBe("delivered");
    expect(db.emailJob.update).not.toHaveBeenCalled();
  });

  it("does not cancel a job currently being processed", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "processing" });
    const result = await cancelJob("job-1");
    expect(result.status).toBe("processing");
    expect(db.emailJob.update).not.toHaveBeenCalled();
  });

  it("cancelJob is a no-op for an unknown job id", async () => {
    db.emailJob.findUnique.mockResolvedValue(null);
    const result = await cancelJob("missing");
    expect(result).toBeNull();
  });
});

describe("claimNextBatch", () => {
  it("delegates to a single atomic SKIP LOCKED update", async () => {
    db.$queryRaw.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);
    const jobs = await claimNextBatch(5);
    expect(jobs).toHaveLength(2);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleRetry", () => {
  it("schedules a future retry when attempts remain", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", attemptCount: 1, maximumAttempts: 5 });
    db.emailJob.update.mockResolvedValue({ id: "job-1", status: "pending" });
    await scheduleRetry("job-1", "retryable_provider_error", "temporary failure");
    expect(db.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending", nextAttemptAt: expect.any(Date) }) })
    );
  });

  it("marks the job failed once maximum attempts are exhausted", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", attemptCount: 5, maximumAttempts: 5 });
    db.emailJob.update.mockResolvedValue({ id: "job-1", status: "failed" });
    await scheduleRetry("job-1", "retryable_provider_error", "still failing");
    expect(db.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
    );
  });
});

describe("markPermanentFailure", () => {
  it("marks the job failed immediately regardless of attempt count", async () => {
    db.emailJob.update.mockResolvedValue({ id: "job-1", status: "failed" });
    await markPermanentFailure("job-1", "permanent_provider_error", "invalid recipient");
    expect(db.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed", lastErrorCode: "permanent_provider_error" }) })
    );
  });
});

describe("applyWebhookStatus (out-of-order protection)", () => {
  it("applies a forward status transition", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "provider_accepted" });
    db.emailJob.update.mockResolvedValue({ id: "job-1", status: "delivered" });
    const result = await applyWebhookStatus("job-1", "delivered", "deliveredAt");
    expect(result.status).toBe("delivered");
    expect(db.emailJob.update).toHaveBeenCalled();
  });

  it("never regresses a terminal status on an out-of-order event", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "delivered" });
    const result = await applyWebhookStatus("job-1", "provider_accepted", "sentAt");
    expect(result.status).toBe("delivered");
    expect(db.emailJob.update).not.toHaveBeenCalled();
  });
});

describe("recordEvent", () => {
  it("creates a new event and reports created: true", async () => {
    db.emailEvent.create.mockResolvedValue({ id: "event-1" });
    const result = await recordEvent("job-1", "svix-1", "email.delivered", new Date(), null);
    expect(result.created).toBe(true);
  });

  it("returns the existing event and reports created: false on a duplicate provider event id", async () => {
    db.emailEvent.create.mockRejectedValue({ code: "P2002" });
    db.emailEvent.findUnique.mockResolvedValue({ id: "event-1" });
    const result = await recordEvent("job-1", "svix-1", "email.delivered", new Date(), null);
    expect(result.created).toBe(false);
    expect(result.event).toEqual({ id: "event-1" });
  });
});

describe("recoverStuckJobs", () => {
  it("resets a stuck job with remaining attempts back to pending", async () => {
    db.emailJob.findMany.mockResolvedValue([{ id: "job-1", attemptCount: 1, maximumAttempts: 5 }]);
    db.emailJob.update.mockResolvedValue({});
    const recovered = await recoverStuckJobs(10);
    expect(recovered).toBe(1);
    expect(db.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "pending" }) })
    );
  });

  it("marks an exhausted stuck job as failed instead of retrying forever", async () => {
    db.emailJob.findMany.mockResolvedValue([{ id: "job-1", attemptCount: 5, maximumAttempts: 5 }]);
    db.emailJob.update.mockResolvedValue({});
    await recoverStuckJobs(10);
    expect(db.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
    );
  });
});
