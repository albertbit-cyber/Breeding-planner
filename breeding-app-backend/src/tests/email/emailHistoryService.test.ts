import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    emailJob: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    adminAuditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma";
import { adminRetryJob, getJobForOwner, getMyEmailHistory } from "../../email/emailHistoryService";

const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("getJobForOwner scopes the lookup to the requesting owner, never a raw job id lookup", async () => {
    db.emailJob.findFirst.mockResolvedValue(null);
    await getJobForOwner("job-1", "owner-a");
    expect(db.emailJob.findFirst).toHaveBeenCalledWith({ where: { id: "job-1", ownerId: "owner-a" } });
  });

  it("getMyEmailHistory only queries jobs owned by the given user", async () => {
    db.emailJob.findMany.mockResolvedValue([]);
    await getMyEmailHistory("owner-a");
    expect(db.emailJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-a" } })
    );
  });
});

describe("email history user-safe DTO", () => {
  it("masks the recipient address and omits internal identifiers", async () => {
    db.emailJob.findMany.mockResolvedValue([
      {
        id: "job-1",
        ownerId: "owner-a",
        recipientEmail: "jane.doe@example.com",
        templateKey: "breeding_reminder",
        category: "breeding_reminders",
        status: "delivered",
        scheduledFor: new Date(),
        sentAt: new Date(),
        deliveredAt: new Date(),
        failedAt: null,
        cancelledAt: null,
        relatedEntityType: "reproductive_cycle",
        relatedEntityId: "cycle-1",
        createdAt: new Date(),
      },
    ]);
    const [entry] = await getMyEmailHistory("owner-a");
    expect(entry).not.toHaveProperty("id");
    expect(entry).not.toHaveProperty("ownerId");
    expect(entry.recipient).not.toBe("jane.doe@example.com");
    expect(entry.recipient).toContain("@example.com");
  });
});

describe("adminRetryJob", () => {
  it("rejects retrying a job that is not in a retryable state", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "delivered" });
    await expect(adminRetryJob("job-1", "admin-1", "operator requested")).rejects.toThrow("can be retried");
  });

  it("re-queues a failed job and writes an audit log entry", async () => {
    db.emailJob.findUnique.mockResolvedValue({ id: "job-1", status: "failed" });
    db.emailJob.update.mockResolvedValue({ id: "job-1", status: "pending" });
    const result = await adminRetryJob("job-1", "admin-1", "confirmed provider outage resolved");
    expect(result.status).toBe("pending");
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "email_job_retried", adminUserId: "admin-1" }) })
    );
  });
});
