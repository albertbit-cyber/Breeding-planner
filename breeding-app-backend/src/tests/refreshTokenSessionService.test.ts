import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    refreshSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma";
import {
  createRefreshSession,
  findActiveRefreshSession,
  hashRefreshToken,
  matchesStoredRefreshToken,
  rotateRefreshSession,
} from "../services/refreshTokenSessionService";

describe("refresh token session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hashes refresh tokens and does not match raw hashes accidentally", () => {
    const hash = hashRefreshToken("refresh-token");
    expect(hash).toMatch(/^sha256:/);
    expect(hash).not.toBe("refresh-token");
    expect(matchesStoredRefreshToken(hash, "refresh-token")).toBe(true);
    expect(matchesStoredRefreshToken(hash, "other-token")).toBe(false);
  });

  it("creates and rotates database refresh sessions", async () => {
    vi.mocked((prisma as any).refreshSession.create).mockResolvedValue({ id: "session-next" });
    vi.mocked((prisma as any).refreshSession.updateMany).mockResolvedValue({ count: 1 });

    await createRefreshSession("user-1", "old-token");
    await rotateRefreshSession("user-1", "old-token", "new-token");

    expect((prisma as any).refreshSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        tokenHash: expect.stringMatching(/^sha256:/),
      }),
    }));
    expect((prisma as any).refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        tokenHash: expect.stringMatching(/^sha256:/),
      }),
      data: expect.objectContaining({
        replacedBySessionId: "session-next",
      }),
    }));
  });

  it("finds only active non-expired sessions", async () => {
    vi.mocked((prisma as any).refreshSession.findFirst).mockResolvedValue({ id: "session-1" });
    await expect(findActiveRefreshSession("user-1", "token")).resolves.toEqual({ id: "session-1" });
    expect((prisma as any).refreshSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        revokedAt: null,
        expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
      }),
    }));
  });
});

