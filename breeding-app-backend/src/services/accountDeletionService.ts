import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { env } from "../config/env";
import { recordSecurityEvent } from "./securityEventService";
import { revokeRefreshSessionsForUser } from "./refreshTokenSessionService";
import { enqueueEmail } from "../email/queueService";
import {
  ACCOUNT_DELETION_SCHEDULED_TEMPLATE_KEY,
  ACCOUNT_DELETION_SCHEDULED_TEMPLATE_VERSION,
  ACCOUNT_DELETION_CANCELLED_TEMPLATE_KEY,
  ACCOUNT_DELETION_CANCELLED_TEMPLATE_VERSION,
} from "../email/templates";
import {
  accountDeletionScheduledIdempotencyKey,
  accountDeletionCancelledIdempotencyKey,
} from "../email/idempotency";

/**
 * Right to erasure (GDPR Art. 17), implemented as full destruction rather than
 * anonymisation — a deliberate product decision (2026-08-03): when a user
 * leaves, nothing of theirs is retained, including their side of marketplace
 * sales and the reviews they wrote.
 *
 * Two consequences worth being aware of, both accepted:
 *  - A buyer loses their record of a purchase if the *seller* deletes.
 *  - A seller can shed negative reviews by deleting and re-registering.
 *
 * There is one deliberate exception, in `AdminAuditLog`. Those rows record what
 * *staff* did, not what the user did, and they are the safeguard against staff
 * abusing moderation powers. They are left in place with the user reference
 * nulled by the existing SetNull constraint, so the action survives and the
 * person does not. Erasing them on request would let a banned user destroy the
 * evidence of their ban.
 */

export const DELETION_GRACE_PERIOD_DAYS = 30;

export const PENDING_DELETION_STATUS = "pending_deletion";

const graceDeadline = (from = new Date()): Date => {
  const deadline = new Date(from);
  deadline.setDate(deadline.getDate() + DELETION_GRACE_PERIOD_DAYS);
  return deadline;
};

const signInUrl = (): string => `${String(env.publicAppUrl || "").replace(/\/$/, "")}/login`;

const formatDeadline = (value: Date): string =>
  value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export type DeletionStatus = {
  pending: boolean;
  requestedAt: Date | null;
  scheduledAt: Date | null;
  gracePeriodDays: number;
};

export const getDeletionStatus = async (userId: string): Promise<DeletionStatus> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, deletionRequestedAt: true, deletionScheduledAt: true },
  });
  if (!user) throw new HttpError(404, "User not found.");

  return {
    pending: user.status === PENDING_DELETION_STATUS,
    requestedAt: user.deletionRequestedAt ?? null,
    scheduledAt: user.deletionScheduledAt ?? null,
    gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
  };
};

/**
 * Password re-entry is required even though the caller is already authenticated.
 * An unattended session is the realistic attack here, and this is the most
 * destructive action in the product.
 */
export const requestAccountDeletion = async (userId: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new HttpError(404, "User not found.");

  if (user.status === PENDING_DELETION_STATUS) {
    throw new HttpError(409, "This account is already scheduled for deletion.");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    await recordSecurityEvent({
      type: "account.deletion.request",
      actorUserId: user.id,
      outcome: "failure",
      reason: "Incorrect password.",
    });
    throw new HttpError(401, "Password is incorrect.");
  }

  const requestedAt = new Date();
  const scheduledAt = graceDeadline(requestedAt);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: PENDING_DELETION_STATUS,
      deletionRequestedAt: requestedAt,
      deletionScheduledAt: scheduledAt,
      refreshToken: null,
    },
  });

  // Locked out everywhere immediately. Signing back in is what cancels the
  // request, so this is not a lockout the user cannot escape.
  await revokeRefreshSessionsForUser(user.id);

  await recordSecurityEvent({
    type: "account.deletion.request",
    actorUserId: user.id,
    outcome: "success",
    metadata: { scheduledAt: scheduledAt.toISOString() },
  });

  await enqueueEmail({
    ownerId: user.id,
    recipientEmail: user.email,
    category: "account_and_security",
    templateKey: ACCOUNT_DELETION_SCHEDULED_TEMPLATE_KEY,
    templateVersion: ACCOUNT_DELETION_SCHEDULED_TEMPLATE_VERSION,
    templatePayload: {
      fullName: user.fullName,
      scheduledAtDisplay: formatDeadline(scheduledAt),
      cancelUrl: signInUrl(),
    },
    subject: "Your Breeding Planner account is scheduled for deletion",
    idempotencyKey: accountDeletionScheduledIdempotencyKey(user.id, scheduledAt),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });

  return {
    pending: true,
    requestedAt,
    scheduledAt,
    gracePeriodDays: DELETION_GRACE_PERIOD_DAYS,
    message: `Your account will be permanently deleted on ${formatDeadline(scheduledAt)}. Sign in before then to cancel.`,
  };
};

/**
 * Called explicitly from the UI and implicitly on sign-in. Safe to call when no
 * deletion is pending — it reports that and sends no mail, so the sign-in path
 * can call it unconditionally.
 */
export const cancelAccountDeletion = async (userId: string, opts: { notify?: boolean } = {}) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "User not found.");

  if (user.status !== PENDING_DELETION_STATUS) {
    return { pending: false, cancelled: false, message: "No deletion is pending for this account." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { status: "active", deletionRequestedAt: null, deletionScheduledAt: null },
  });

  await recordSecurityEvent({
    type: "account.deletion.cancelled",
    actorUserId: user.id,
    outcome: "success",
  });

  if (opts.notify !== false) {
    await enqueueEmail({
      ownerId: user.id,
      recipientEmail: user.email,
      category: "account_and_security",
      templateKey: ACCOUNT_DELETION_CANCELLED_TEMPLATE_KEY,
      templateVersion: ACCOUNT_DELETION_CANCELLED_TEMPLATE_VERSION,
      templatePayload: { fullName: user.fullName },
      subject: "Your Breeding Planner account deletion was cancelled",
      idempotencyKey: accountDeletionCancelledIdempotencyKey(user.id),
      relatedEntityType: "user",
      relatedEntityId: user.id,
    });
  }

  return { pending: false, cancelled: true, message: "Account deletion cancelled. Your account is active again." };
};

/**
 * Rows that survive a `user.delete()` because their foreign key is SetNull
 * rather than Cascade. Left alone they would linger as ownerless records still
 * containing the user's words — message text, report descriptions, review
 * bodies — which is exactly what erasure is supposed to remove. Each entry is
 * deleted explicitly, before the user row goes.
 *
 * Ordering matters only in that parents precede the children that cascade from
 * them; everything here is otherwise independent.
 */
const purgeSetNullResidue = async (tx: any, userId: string): Promise<void> => {
  // Marketplace conversations the user bought through, plus every message and
  // report cascading from them.
  await tx.marketplaceConversation.deleteMany({ where: { buyerUserId: userId } });
  // Messages the user sent in conversations owned by someone else.
  await tx.marketplaceMessage.deleteMany({ where: { senderUserId: userId } });
  await tx.marketplaceMessageReport.deleteMany({ where: { reporterUserId: userId } });

  // Sales where the user was the buyer (seller-side sales cascade with the
  // user). Reviews hanging off those sales cascade too.
  await tx.marketplaceSale.deleteMany({ where: { buyerUserId: userId } });
  await tx.marketplaceReview.deleteMany({ where: { reviewerUserId: userId } });

  await tx.listingInquiry.deleteMany({ where: { buyerId: userId } });
  await tx.listingModerationAudit.deleteMany({ where: { actorId: userId } });
  await tx.notification.deleteMany({ where: { actorId: userId } });
  await tx.securityEvent.deleteMany({ where: { actorUserId: userId } });

  await tx.report.deleteMany({
    where: { OR: [{ reporterUserId: userId }, { reportedUserId: userId }, { assignedAdminId: userId }] },
  });

  await tx.organizationInvite.deleteMany({
    where: { OR: [{ invitedBy: userId }, { acceptedByUserId: userId }] },
  });

  // Staff-role residue. Only ever populated if the departing account was an
  // admin; harmless no-ops otherwise.
  await tx.verificationRequest.deleteMany({ where: { reviewedBy: userId } });
  await tx.gdprRequest.deleteMany({ where: { reviewedBy: userId } });
  await tx.userFeatureOverride.deleteMany({ where: { createdByAdminId: userId } });
};

/**
 * Irreversible. Runs in a transaction so a failure part-way cannot leave an
 * account half-erased — either every trace goes or none does.
 */
export const hardDeleteUser = async (userId: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, membership: { select: { organizationId: true } } },
  });
  if (!user) return;

  const organizationId = user.membership?.organizationId ?? null;

  await prisma.$transaction(async (tx: any) => {
    await purgeSetNullResidue(tx, userId);

    // Keyed by address, not by user id, so it does not cascade. Retaining a
    // suppression for an address whose account no longer exists would keep a
    // record of a person we have undertaken to forget.
    if (user.email) {
      await tx.emailSuppression.deleteMany({ where: { emailAddress: user.email.toLowerCase() } });
    }

    // Everything with a Cascade constraint goes with this one statement:
    // animals, pairings, clutches, profile, listings, lab orders, sessions,
    // tokens, queued mail, membership, and the rest.
    await tx.user.delete({ where: { id: userId } });

    // An organisation left with no members is dead weight holding a tenant
    // name and billing email. Cascades to LabAccount and any remaining invites.
    if (organizationId) {
      const remaining = await tx.membership.count({ where: { organizationId } });
      if (remaining === 0) {
        await tx.organization.delete({ where: { id: organizationId } });
      }
    }
  });

  // Deliberately after the transaction and without an actor id — the actor no
  // longer exists, and recording it inside would be rolled back on failure.
  await recordSecurityEvent({
    type: "account.deletion.completed",
    outcome: "success",
    metadata: { deletedUserId: userId },
  });

  console.info("[account-deletion] purged", { userId });
};

/**
 * Finds accounts whose grace period has expired and erases them. Returns the
 * number purged. Never throws for a single bad account — one undeletable row
 * must not stall the queue behind it.
 */
export const purgeDueAccounts = async (now = new Date()): Promise<number> => {
  const due = await prisma.user.findMany({
    where: {
      status: PENDING_DELETION_STATUS,
      deletionScheduledAt: { not: null, lte: now },
    },
    select: { id: true },
    take: 50,
  });

  let purged = 0;
  for (const { id } of due) {
    try {
      await hardDeleteUser(id);
      purged += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[account-deletion] purge failed", { userId: id, message });
      await recordSecurityEvent({
        type: "account.deletion.completed",
        actorUserId: id,
        outcome: "failure",
        reason: message,
      });
    }
  }

  return purged;
};
