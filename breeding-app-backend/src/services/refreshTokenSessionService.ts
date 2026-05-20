import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "../lib/prisma";

const REFRESH_TOKEN_HASH_PREFIX = "sha256:";
const DEFAULT_REFRESH_SESSION_DAYS = 30;

export const hashRefreshToken = (refreshToken: string): string =>
  `${REFRESH_TOKEN_HASH_PREFIX}${createHash("sha256").update(refreshToken).digest("hex")}`;

export const isHashedRefreshToken = (value: string | null | undefined): boolean =>
  Boolean(value && value.startsWith(REFRESH_TOKEN_HASH_PREFIX));

const timingSafeStringEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const matchesStoredRefreshToken = (
  storedRefreshToken: string | null | undefined,
  incomingRefreshToken: string
): boolean => {
  if (!storedRefreshToken || !incomingRefreshToken) return false;
  const expected = isHashedRefreshToken(storedRefreshToken)
    ? hashRefreshToken(incomingRefreshToken)
    : incomingRefreshToken;
  return timingSafeStringEqual(storedRefreshToken, expected);
};

const refreshSessionDb = () => (prisma as any).refreshSession;

const refreshSessionExpiresAt = (): Date => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_REFRESH_SESSION_DAYS);
  return expiresAt;
};

export const createRefreshSession = async (userId: string, refreshToken: string) => {
  const db = refreshSessionDb();
  if (!db?.create) return null;
  return db.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshSessionExpiresAt(),
    },
  });
};

export const findActiveRefreshSession = async (userId: string, refreshToken: string) => {
  const db = refreshSessionDb();
  if (!db?.findFirst) return null;
  return db.findFirst({
    where: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
};

export const rotateRefreshSession = async (
  userId: string,
  previousRefreshToken: string,
  nextRefreshToken: string
) => {
  const db = refreshSessionDb();
  if (!db?.create || !db?.updateMany) return null;

  const nextSession = await db.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(nextRefreshToken),
      expiresAt: refreshSessionExpiresAt(),
    },
  });

  await db.updateMany({
    where: {
      userId,
      tokenHash: hashRefreshToken(previousRefreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      replacedBySessionId: nextSession.id,
      lastUsedAt: new Date(),
    },
  });

  return nextSession;
};

export const revokeRefreshSessionsForUser = async (userId: string) => {
  const db = refreshSessionDb();
  if (!db?.updateMany) return null;
  return db.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
};
