import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { normalizeEmailAddress } from "./types";

const db = prisma as any;

export type SuppressionReason = "hard_bounce" | "complaint" | "unsubscribe" | "admin";
export type SuppressionSource = "webhook" | "admin";

export const isRecipientSuppressed = async (emailAddress: string): Promise<boolean> => {
  const normalized = normalizeEmailAddress(emailAddress);
  const existing = await db.emailSuppression.findUnique({ where: { emailAddress: normalized } });
  return Boolean(existing && !existing.releasedAt);
};

/**
 * Idempotent: suppressing an already-suppressed address updates the reason
 * instead of erroring, since bounce/complaint webhooks can arrive more than
 * once for the same recipient.
 */
export const suppressRecipient = async (
  emailAddress: string,
  reason: SuppressionReason,
  source: SuppressionSource
) => {
  const normalized = normalizeEmailAddress(emailAddress);
  return db.emailSuppression.upsert({
    where: { emailAddress: normalized },
    create: { emailAddress: normalized, reason, source },
    update: { reason, source, releasedAt: null, releasedBy: null },
  });
};

/** Administrative release — must only be called from an authorized, audited admin action. */
export const releaseSuppression = async (
  emailAddress: string,
  releasedByUserId: string,
  reason: string
) => {
  const normalized = normalizeEmailAddress(emailAddress);
  const existing = await db.emailSuppression.findUnique({ where: { emailAddress: normalized } });
  if (!existing) throw new HttpError(404, "No suppression entry found for this address.");

  const released = await db.emailSuppression.update({
    where: { emailAddress: normalized },
    data: { releasedAt: new Date(), releasedBy: releasedByUserId },
  });

  await db.adminAuditLog.create({
    data: {
      adminUserId: releasedByUserId,
      action: "email_suppression_released",
      beforeJson: { emailAddress: normalized, reason: existing.reason, source: existing.source },
      afterJson: { emailAddress: normalized, releasedAt: released.releasedAt },
      reason,
    },
  });

  return released;
};

export const listSuppressions = async () =>
  db.emailSuppression.findMany({ orderBy: [{ createdAt: "desc" }], take: 200 });
