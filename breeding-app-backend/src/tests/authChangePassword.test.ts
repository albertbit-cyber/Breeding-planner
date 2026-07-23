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
  db.refreshSession.updateMany.mockResolvedValue({ count: 1 });
});

describe("PATCH /api/auth/me/password", () => {
  it("changes the password on a correct current password, revokes sessions and queues a confirmation email", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);
    db.user.update.mockResolvedValue({ ...mockUser, passwordChangedAt: new Date() });

    const res = await request(app)
      .patch("/api/auth/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "password123", newPassword: "newpassword123" });

    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: expect.objectContaining({ passwordChangedAt: expect.any(Date), refreshToken: null }),
    }));
    expect(db.refreshSession.updateMany).toHaveBeenCalled();
    expect(db.accountToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", purpose: "reset_password" }),
    }));
    expect(enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({ templateKey: "account_password_changed" }));
  });

  it("returns 401 on an incorrect current password", async () => {
    const token = await getToken();
    vi.clearAllMocks(); // clear the login call's own user.update(refreshToken) so the assertion below is about this request only
    db.user.findUnique.mockResolvedValue(mockUser);

    const res = await request(app)
      .patch("/api/auth/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrongpassword", newPassword: "newpassword123" });

    expect(res.status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 on a weak new password", async () => {
    const token = await getToken();
    const res = await request(app)
      .patch("/api/auth/me/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "password123", newPassword: "short" });

    expect(res.status).toBe(400);
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).patch("/api/auth/me/password").send({ currentPassword: "x", newPassword: "newpassword123" });
    expect(res.status).toBe(401);
  });
});
