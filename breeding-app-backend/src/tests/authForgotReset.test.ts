import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../lib/prisma", () => {
  const accountToken = {
    updateMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn() },
      refreshSession: { updateMany: vi.fn() },
      securityEvent: { create: vi.fn() },
      accountToken,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ accountToken })),
    },
  };
});

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";
import { enqueueEmail } from "../email/queueService";

const db = prisma as any;

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  fullName: "Test User",
  role: "breeder",
  isActive: true,
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.refreshSession.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/auth/forgot-password", () => {
  it("returns the generic message and queues a reset email for an existing active account", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.create.mockResolvedValue({ id: "token-1" });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If that email is registered, a reset link has been sent.");
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: "account_password_reset",
      recipientEmail: "test@example.com",
      category: "account_and_security",
    }));
  });

  it("returns the identical generic message for an unknown email and does not enqueue", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If that email is registered, a reset link has been sent.");
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("returns the identical generic message for a disabled account and does not enqueue", async () => {
    db.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("If that email is registered, a reset link has been sent.");
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("supersedes a previous outstanding reset token when requested again", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);
    db.accountToken.updateMany.mockResolvedValue({ count: 1 });
    db.accountToken.create.mockResolvedValue({ id: "token-2" });

    await request(app).post("/api/auth/forgot-password").send({ email: "test@example.com" });

    expect(db.accountToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", purpose: "reset_password", consumedAt: null, revokedAt: null },
    }));
  });
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password on a valid token, revokes sessions, and queues a confirmation email", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 1 });
    db.accountToken.findUnique.mockResolvedValue({ userId: "user-1", emailAddress: "test@example.com" });
    db.user.findUnique.mockResolvedValue(mockUser);
    db.user.update.mockResolvedValue(mockUser);

    const res = await request(app).post("/api/auth/reset-password").send({ token: "raw-token", newPassword: "newpassword123" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Password updated");
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({ passwordChangedAt: expect.any(Date), refreshToken: null }),
    }));
    expect(db.refreshSession.updateMany).toHaveBeenCalled();
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "account_password_changed" }));
  });

  it("returns 400 for an expired reset token", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({ token: "expired", newPassword: "newpassword123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the same reset token is submitted twice (already consumed)", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
    });

    const res = await request(app).post("/api/auth/reset-password").send({ token: "used-token", newPassword: "newpassword123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a revoked reset token", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: null,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60),
    });

    const res = await request(app).post("/api/auth/reset-password").send({ token: "revoked", newPassword: "newpassword123" });
    expect(res.status).toBe(400);
  });

  it("returns 400 on a weak new password", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "raw-token", newPassword: "short" });
    expect(res.status).toBe(400);
  });
});
