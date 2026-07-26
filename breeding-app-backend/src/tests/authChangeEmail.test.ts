import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

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
      refreshSession: { create: vi.fn(), updateMany: vi.fn() },
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
  passwordHash: bcrypt.hashSync("password123", 1),
  fullName: "Test User",
  role: "breeder",
  isActive: true,
  emailVerified: true,
  pendingEmail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const getToken = async (): Promise<string> => {
  db.user.findUnique.mockResolvedValue(mockUser);
  db.user.update.mockResolvedValue(mockUser);
  db.refreshSession.create.mockResolvedValue({ id: "session-1" });
  const res = await request(app).post("/api/auth/login").send({ email: "test@example.com", password: "password123" });
  return res.body.token;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/auth/me/email (request change)", () => {
  it("stores a pending email, leaves the current email active, and queues a verification email to the new address", async () => {
    const token = await getToken();
    db.user.findUnique
      .mockResolvedValueOnce(mockUser) // load the acting user
      .mockResolvedValueOnce(null); // new email not taken
    db.user.update.mockResolvedValue({ ...mockUser, pendingEmail: "new@example.com", pendingEmailRequestedAt: new Date() });
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.create.mockResolvedValue({ id: "token-1" });

    const res = await request(app)
      .patch("/api/auth/me/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@example.com", currentPassword: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@example.com");
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { pendingEmail: "new@example.com", pendingEmailRequestedAt: expect.any(Date) },
    }));
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: "account_verify_new_email",
      recipientEmail: "new@example.com",
    }));
  });

  it("returns 409 when the requested new email is already taken", async () => {
    const token = await getToken();
    db.user.findUnique
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce({ id: "other-user", email: "taken@example.com" });

    const res = await request(app)
      .patch("/api/auth/me/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "taken@example.com", currentPassword: "password123" });

    expect(res.status).toBe(409);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("returns 400 when requesting a change to the current email address", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValueOnce(mockUser);

    const res = await request(app)
      .patch("/api/auth/me/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "test@example.com", currentPassword: "password123" });

    expect(res.status).toBe(400);
  });

  it("returns 401 on an incorrect current password", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValueOnce(mockUser);

    const res = await request(app)
      .patch("/api/auth/me/email")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@example.com", currentPassword: "wrongpassword" });

    expect(res.status).toBe(401);
  });
});

describe("GET/POST /api/auth/confirm-email-change", () => {
  it("completes the change: moves pendingEmail to email, marks verified, notifies the old address", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 1 });
    db.accountToken.findUnique.mockResolvedValue({ userId: "user-1", emailAddress: "new@example.com" });
    db.user.findUnique
      .mockResolvedValueOnce({ ...mockUser, pendingEmail: "new@example.com" }) // load acting user with pending email
      .mockResolvedValueOnce(null); // new email still available
    db.user.update.mockResolvedValue({ ...mockUser, email: "new@example.com", pendingEmail: null, emailVerified: true });

    const res = await request(app).get("/api/auth/confirm-email-change").query({ token: "raw-token" });

    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: "new@example.com",
        pendingEmail: null,
        pendingEmailRequestedAt: null,
        emailVerified: true,
      }),
    }));
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: "account_email_changed",
      recipientEmail: "test@example.com",
    }));
  });

  it("fails cleanly when the new email was claimed by someone else before confirmation", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 1 });
    db.accountToken.findUnique.mockResolvedValue({ userId: "user-1", emailAddress: "new@example.com" });
    db.user.findUnique
      .mockResolvedValueOnce({ ...mockUser, pendingEmail: "new@example.com" })
      .mockResolvedValueOnce({ id: "someone-else", email: "new@example.com" });

    const res = await request(app).get("/api/auth/confirm-email-change").query({ token: "raw-token" });

    expect(res.status).toBe(409);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { pendingEmail: null, pendingEmailRequestedAt: null },
    }));
  });

  it("returns 400 for an expired confirmation token", async () => {
    db.accountToken.updateMany.mockResolvedValue({ count: 0 });
    db.accountToken.findFirst.mockResolvedValue({
      userId: "user-1",
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).get("/api/auth/confirm-email-change").query({ token: "expired" });
    expect(res.status).toBe(400);
  });
});
