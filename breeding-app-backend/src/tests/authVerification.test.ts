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
  emailVerified: false,
  emailVerifiedAt: null,
  pendingEmail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET/POST /api/auth/verify-email", () => {
  it("verifies on a valid token and flips emailVerified", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 1 });
    db.accountToken.findUnique.mockResolvedValue({ userId: "user-1", emailAddress: "test@example.com" });
    db.user.findUnique.mockResolvedValue(mockUser);
    db.user.update.mockResolvedValue({ ...mockUser, emailVerified: true, emailVerifiedAt: new Date() });

    const res = await request(app).get("/api/auth/verify-email").query({ token: "raw-token" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Email verified.");
    expect(res.body.alreadyVerified).toBe(false);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({ emailVerified: true, emailVerifiedAt: expect.any(Date) }),
    }));
  });

  it("returns a friendly already-verified result for a token used twice, not an error", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: new Date(),
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
    });
    db.user.findUnique.mockResolvedValue({ ...mockUser, emailVerified: true });

    const res = await request(app).post("/api/auth/verify-email").send({ token: "already-used" });

    expect(res.status).toBe(200);
    expect(res.body.alreadyVerified).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an expired token", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).get("/api/auth/verify-email").query({ token: "expired" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a revoked (superseded) token", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: null,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60),
    });

    const res = await request(app).get("/api/auth/verify-email").query({ token: "revoked" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown/invalid token", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue(null);

    const res = await request(app).get("/api/auth/verify-email").query({ token: "bogus" });
    expect(res.status).toBe(400);
  });

  it("returns 400 with no token provided", async () => {
    const res = await request(app).get("/api/auth/verify-email");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/resend-verification", () => {
  it("queues a new verification email for an unverified account and supersedes the old token", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);
    db.accountToken.updateMany.mockResolvedValue({ count: 1 });
    db.accountToken.create.mockResolvedValue({ id: "token-2" });

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If that email is registered");
    expect(db.accountToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", purpose: "verify_email" }),
    }));
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: "account_email_verification",
      recipientEmail: "test@example.com",
    }));
  });

  it("returns the same generic message for an already-verified account and does not enqueue", async () => {
    db.user.findUnique.mockResolvedValue({ ...mockUser, emailVerified: true });

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If that email is registered");
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("returns the same generic message for an unknown email and does not enqueue (no enumeration)", async () => {
    db.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/auth/resend-verification").send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If that email is registered");
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid email", async () => {
    const res = await request(app).post("/api/auth/resend-verification").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});
