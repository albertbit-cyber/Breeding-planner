import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

vi.mock("../lib/prisma", () => {
  const model = () => ({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) });
  const tx = {
    marketplaceConversation: model(),
    marketplaceMessage: model(),
    marketplaceMessageReport: model(),
    marketplaceSale: model(),
    marketplaceReview: model(),
    listingInquiry: model(),
    listingModerationAudit: model(),
    notification: model(),
    securityEvent: model(),
    report: model(),
    organizationInvite: model(),
    verificationRequest: model(),
    gdprRequest: model(),
    userFeatureOverride: model(),
    emailSuppression: model(),
    user: { delete: vi.fn().mockResolvedValue({}) },
    membership: { count: vi.fn().mockResolvedValue(0) },
    organization: { delete: vi.fn().mockResolvedValue({}) },
  };

  return {
    prisma: {
      user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      refreshSession: { create: vi.fn(), updateMany: vi.fn() },
      securityEvent: { create: vi.fn() },
      membership: { findUnique: vi.fn() },
      $transaction: vi.fn((callback: (t: unknown) => unknown) => callback(tx)),
      __tx: tx,
    },
  };
});

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

import { app } from "../app";
import { prisma } from "../lib/prisma";
import { enqueueEmail } from "../email/queueService";
import { hardDeleteUser, purgeDueAccounts, PENDING_DELETION_STATUS } from "../services/accountDeletionService";

const db = prisma as any;
const tx = db.__tx;

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  passwordHash: bcrypt.hashSync("password123", 1),
  fullName: "Test User",
  role: "breeder",
  isActive: true,
  emailVerified: true,
  status: "active",
  deletionRequestedAt: null,
  deletionScheduledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const getToken = async (user = mockUser): Promise<string> => {
  db.user.findUnique.mockResolvedValue(user);
  db.user.update.mockResolvedValue(user);
  db.refreshSession.create.mockResolvedValue({ id: "session-1" });
  const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "password123" });
  return res.body.token;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.refreshSession.updateMany.mockResolvedValue({ count: 1 });
  db.user.findMany.mockResolvedValue([]);
  tx.membership.count.mockResolvedValue(0);
});

describe("POST /api/auth/me/deletion", () => {
  it("schedules deletion 30 days out, locks the account and revokes every session", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);
    db.user.update.mockResolvedValue({ ...mockUser, status: PENDING_DELETION_STATUS });

    const res = await request(app)
      .post("/api/auth/me/deletion")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "password123", confirmation: "DELETE" });

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(true);

    const update = db.user.update.mock.calls.at(-1)[0];
    expect(update.data.status).toBe(PENDING_DELETION_STATUS);
    expect(update.data.refreshToken).toBeNull();

    const days = Math.round(
      (new Date(update.data.deletionScheduledAt).getTime() - new Date(update.data.deletionRequestedAt).getTime()) /
        86_400_000
    );
    expect(days).toBe(30);

    expect(db.refreshSession.updateMany).toHaveBeenCalled();
    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: "account_deletion_scheduled", category: "account_and_security" })
    );
  });

  it("refuses on a wrong password and changes nothing", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);
    db.user.update.mockClear();

    const res = await request(app)
      .post("/api/auth/me/deletion")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "wrong-password", confirmation: "DELETE" });

    expect(res.status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("refuses without the typed DELETE confirmation", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue(mockUser);
    db.user.update.mockClear();

    const res = await request(app)
      .post("/api/auth/me/deletion")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "password123", confirmation: "yes" });

    expect(res.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects a second request while one is already pending", async () => {
    const token = await getToken();
    db.user.findUnique.mockResolvedValue({ ...mockUser, status: PENDING_DELETION_STATUS });

    const res = await request(app)
      .post("/api/auth/me/deletion")
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "password123", confirmation: "DELETE" });

    expect(res.status).toBe(409);
  });
});

describe("signing in during the grace period", () => {
  it("cancels the pending deletion and clears both timestamps", async () => {
    const pending = {
      ...mockUser,
      status: PENDING_DELETION_STATUS,
      deletionRequestedAt: new Date(),
      deletionScheduledAt: new Date(Date.now() + 86_400_000),
    };
    db.user.findUnique.mockResolvedValue(pending);
    db.user.update.mockResolvedValue({ ...pending, status: "active" });
    db.refreshSession.create.mockResolvedValue({ id: "session-1" });

    const res = await request(app).post("/api/auth/login").send({ email: pending.email, password: "password123" });

    expect(res.status).toBe(200);
    const update = db.user.update.mock.calls.at(-1)[0];
    expect(update.data.status).toBe("active");
    expect(update.data.deletionRequestedAt).toBeNull();
    expect(update.data.deletionScheduledAt).toBeNull();

    expect(enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: "account_deletion_cancelled" })
    );
  });

  it("sends no cancellation mail on an ordinary sign-in", async () => {
    await getToken();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe("hardDeleteUser", () => {
  it("removes the SetNull residue that would otherwise survive the user row", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-1", email: "Test@Example.com", membership: null });

    await hardDeleteUser("user-1");

    // Records that would linger, ownerless, still holding the user's words.
    expect(tx.marketplaceMessage.deleteMany).toHaveBeenCalledWith({ where: { senderUserId: "user-1" } });
    expect(tx.marketplaceConversation.deleteMany).toHaveBeenCalledWith({ where: { buyerUserId: "user-1" } });
    expect(tx.marketplaceSale.deleteMany).toHaveBeenCalledWith({ where: { buyerUserId: "user-1" } });
    expect(tx.marketplaceReview.deleteMany).toHaveBeenCalledWith({ where: { reviewerUserId: "user-1" } });
    expect(tx.listingInquiry.deleteMany).toHaveBeenCalledWith({ where: { buyerId: "user-1" } });
    expect(tx.securityEvent.deleteMany).toHaveBeenCalledWith({ where: { actorUserId: "user-1" } });
    expect(tx.report.deleteMany).toHaveBeenCalled();
    expect(tx.organizationInvite.deleteMany).toHaveBeenCalled();

    // Suppression is keyed by address, lowercased, and does not cascade.
    expect(tx.emailSuppression.deleteMany).toHaveBeenCalledWith({
      where: { emailAddress: "test@example.com" },
    });

    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "user-1" } });
  });

  it("deletes an organisation left with no members, and keeps one that still has some", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      membership: { organizationId: "org-1" },
    });

    tx.membership.count.mockResolvedValue(0);
    await hardDeleteUser("user-1");
    expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: "org-1" } });

    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "c@d.com",
      membership: { organizationId: "org-2" },
    });
    tx.membership.count.mockResolvedValue(2);
    await hardDeleteUser("user-2");
    expect(tx.organization.delete).not.toHaveBeenCalled();
  });

  it("is a no-op for a user that no longer exists", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await hardDeleteUser("ghost");
    expect(tx.user.delete).not.toHaveBeenCalled();
  });
});

describe("purgeDueAccounts", () => {
  it("only selects pending accounts whose deadline has passed", async () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    db.user.findMany.mockResolvedValue([]);

    await purgeDueAccounts(now);

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PENDING_DELETION_STATUS,
          deletionScheduledAt: { not: null, lte: now },
        },
      })
    );
  });

  it("keeps going when one account fails to delete", async () => {
    db.user.findMany.mockResolvedValue([{ id: "bad" }, { id: "good" }]);
    db.user.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === "bad") throw new Error("constraint violation");
      return Promise.resolve({ id: "good", email: "good@example.com", membership: null });
    });

    const purged = await purgeDueAccounts(new Date());

    expect(purged).toBe(1);
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "good" } });
  });
});
