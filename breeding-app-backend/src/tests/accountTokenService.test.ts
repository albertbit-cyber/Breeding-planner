import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => {
  const accountToken = {
    updateMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  };
  return {
    prisma: {
      accountToken,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ accountToken })),
    },
  };
});

import { prisma } from "../lib/prisma";
import { issueToken, consumeToken, revokeAllForPurpose } from "../services/accountTokenService";

const db = prisma as any;

describe("accountTokenService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("issueToken", () => {
    it("supersedes prior active tokens of the same purpose before creating a new one", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 1 });
      db.accountToken.create.mockResolvedValue({ id: "token-2", userId: "user-1", purpose: "verify_email" });

      const { rawToken, record } = await issueToken("user-1", "verify_email", "test@example.com", 1000 * 60);

      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
      expect(record).toEqual({ id: "token-2", userId: "user-1", purpose: "verify_email" });
      expect(db.accountToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: "user-1", purpose: "verify_email", consumedAt: null, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }));
      expect(db.accountToken.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          purpose: "verify_email",
          emailAddress: "test@example.com",
          tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          createdBy: "self",
        }),
      }));
    });

    it("never stores the raw token, only its hash", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 0 });
      db.accountToken.create.mockResolvedValue({ id: "token-1" });

      const { rawToken } = await issueToken("user-1", "reset_password", "test@example.com", 1000);
      const createCall = db.accountToken.create.mock.calls[0][0];
      expect(createCall.data.tokenHash).not.toBe(rawToken);
    });
  });

  describe("consumeToken", () => {
    it("returns valid and atomically marks the token consumed when the update matches exactly one row", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 1 });
      db.accountToken.findUnique.mockResolvedValue({ userId: "user-1", emailAddress: "test@example.com" });

      const result = await consumeToken("raw-token", "verify_email");

      expect(result).toEqual({ status: "valid", userId: "user-1", emailAddress: "test@example.com" });
      expect(db.accountToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          purpose: "verify_email",
          consumedAt: null,
          revokedAt: null,
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }));
    });

    it("returns invalid when no token matches at all", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 0 });
      db.accountToken.findFirst.mockResolvedValue(null);

      const result = await consumeToken("unknown-token", "verify_email");
      expect(result).toEqual({ status: "invalid" });
    });

    it("returns expired for a token past its expiry", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 0 });
      db.accountToken.findFirst.mockResolvedValue({
        userId: "user-1",
        revokedAt: null,
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await consumeToken("expired-token", "verify_email");
      expect(result).toEqual({ status: "expired", userId: "user-1" });
    });

    it("returns already_consumed for a token that was already used", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 0 });
      db.accountToken.findFirst.mockResolvedValue({
        userId: "user-1",
        revokedAt: null,
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60),
      });

      const result = await consumeToken("used-token", "verify_email");
      expect(result).toEqual({ status: "already_consumed", userId: "user-1" });
    });

    it("returns revoked for a token that was superseded/revoked", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 0 });
      db.accountToken.findFirst.mockResolvedValue({
        userId: "user-1",
        revokedAt: new Date(),
        consumedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60),
      });

      const result = await consumeToken("revoked-token", "verify_email");
      expect(result).toEqual({ status: "revoked", userId: "user-1" });
    });

    it("only matches the requested purpose (wrong-purpose lookup behaves like invalid)", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 0 });
      db.accountToken.findFirst.mockResolvedValue(null);

      const result = await consumeToken("some-token", "reset_password");
      expect(result).toEqual({ status: "invalid" });
      expect(db.accountToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ purpose: "reset_password" }),
      }));
    });
  });

  describe("revokeAllForPurpose", () => {
    it("revokes every still-active token of the given purpose for the user", async () => {
      db.accountToken.updateMany.mockResolvedValue({ count: 2 });
      await revokeAllForPurpose("user-1", "reset_password");
      expect(db.accountToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: "user-1", purpose: "reset_password", consumedAt: null, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }));
    });
  });
});
