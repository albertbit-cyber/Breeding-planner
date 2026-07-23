import crypto from "crypto";
import { prisma } from "../lib/prisma";

const db = prisma as any;

export type AccountTokenPurpose = "verify_email" | "reset_password" | "verify_new_email";

export type ConsumeTokenResult =
  | { status: "valid"; userId: string; emailAddress: string }
  | { status: "invalid" }
  | { status: "expired"; userId: string }
  | { status: "already_consumed"; userId: string }
  | { status: "revoked"; userId: string };

const hashToken = (rawToken: string): string =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

/**
 * Issues a new single-use token for the given purpose, superseding (revoking)
 * any prior still-active token of the same purpose for this user in the same
 * transaction — only ever one live token per (user, purpose) at a time.
 */
export const issueToken = async (
  userId: string,
  purpose: AccountTokenPurpose,
  emailAddress: string,
  ttlMs: number,
  createdBy: string = "self"
): Promise<{ rawToken: string; record: any }> => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  const record = await db.$transaction(async (tx: any) => {
    await tx.accountToken.updateMany({
      where: { userId, purpose, consumedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.accountToken.create({
      data: { userId, purpose, tokenHash, emailAddress, expiresAt, createdBy },
    });
  });

  return { rawToken, record };
};

/**
 * Atomically consumes a token: the `updateMany` with `consumedAt: null` in the
 * WHERE clause is what makes this single-use — two concurrent requests with
 * the same raw token can never both succeed, since only one `UPDATE` can
 * match the still-unconsumed row.
 */
export const consumeToken = async (
  rawToken: string,
  purpose: AccountTokenPurpose
): Promise<ConsumeTokenResult> => {
  const tokenHash = hashToken(String(rawToken || ""));
  if (!tokenHash) return { status: "invalid" };

  const now = new Date();
  const result = await db.accountToken.updateMany({
    where: { tokenHash, purpose, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });

  if (result.count === 1) {
    const record = await db.accountToken.findUnique({ where: { tokenHash } });
    return { status: "valid", userId: record.userId, emailAddress: record.emailAddress };
  }

  // Success path didn't match — look up the row (failure-path only) to give an accurate reason.
  const record = await db.accountToken.findFirst({ where: { tokenHash, purpose } });
  if (!record) return { status: "invalid" };
  if (record.revokedAt) return { status: "revoked", userId: record.userId };
  if (record.consumedAt) return { status: "already_consumed", userId: record.userId };
  if (record.expiresAt <= now) return { status: "expired", userId: record.userId };
  return { status: "invalid" };
};

/** Revokes every still-active token of a given purpose for a user (e.g. cancelling a pending email change). */
export const revokeAllForPurpose = async (userId: string, purpose: AccountTokenPurpose): Promise<void> => {
  await db.accountToken.updateMany({
    where: { userId, purpose, consumedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
};
