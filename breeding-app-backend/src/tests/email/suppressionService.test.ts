import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    emailSuppression: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    adminAuditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma";
import { isRecipientSuppressed, releaseSuppression, suppressRecipient } from "../../email/suppressionService";

const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("suppressionService", () => {
  it("normalizes the address before checking suppression", async () => {
    db.emailSuppression.findUnique.mockResolvedValue({ emailAddress: "user@example.com", releasedAt: null });
    const suppressed = await isRecipientSuppressed("  User@Example.com ");
    expect(suppressed).toBe(true);
    expect(db.emailSuppression.findUnique).toHaveBeenCalledWith({ where: { emailAddress: "user@example.com" } });
  });

  it("treats a released suppression as no longer suppressed", async () => {
    db.emailSuppression.findUnique.mockResolvedValue({ emailAddress: "user@example.com", releasedAt: new Date() });
    expect(await isRecipientSuppressed("user@example.com")).toBe(false);
  });

  it("returns false when no suppression entry exists", async () => {
    db.emailSuppression.findUnique.mockResolvedValue(null);
    expect(await isRecipientSuppressed("user@example.com")).toBe(false);
  });

  it("suppressRecipient upserts idempotently", async () => {
    db.emailSuppression.upsert.mockResolvedValue({ emailAddress: "user@example.com", reason: "hard_bounce" });
    await suppressRecipient("USER@example.com", "hard_bounce", "webhook");
    expect(db.emailSuppression.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { emailAddress: "user@example.com" } })
    );
  });

  it("releaseSuppression requires an existing entry", async () => {
    db.emailSuppression.findUnique.mockResolvedValue(null);
    await expect(releaseSuppression("user@example.com", "admin-1", "requested by user")).rejects.toThrow("No suppression entry found");
  });

  it("releaseSuppression writes an audit log entry", async () => {
    db.emailSuppression.findUnique.mockResolvedValue({ emailAddress: "user@example.com", reason: "hard_bounce", source: "webhook" });
    db.emailSuppression.update.mockResolvedValue({ emailAddress: "user@example.com", releasedAt: new Date() });
    await releaseSuppression("user@example.com", "admin-1", "confirmed valid address");
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminUserId: "admin-1", action: "email_suppression_released" }) })
    );
  });
});
