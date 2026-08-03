/**
 * Idempotency keys are deterministic strings derived from the business event
 * that triggers an email, not random values — re-running the same trigger
 * (e.g. a retried HTTP request, a re-ingested sync snapshot) must always
 * resolve to the same key so the unique DB constraint blocks duplicates.
 */

export const invitationIdempotencyKey = (invitedUserId: string): string => `invitation:${invitedUserId}`;

export const breedingReminderIdempotencyKey = (
  cycleId: string,
  reminderType: string
): string => `breeding_reminder:${cycleId}:${reminderType}`;

/** One verification email per issued token — a resend issues a new token, so this is never blocked by idempotency. */
export const emailVerificationIdempotencyKey = (userId: string, accountTokenId: string): string =>
  `email_verification:${userId}:${accountTokenId}`;

export const passwordResetIdempotencyKey = (userId: string, accountTokenId: string): string =>
  `password_reset:${userId}:${accountTokenId}`;

export const verifyNewEmailIdempotencyKey = (userId: string, accountTokenId: string): string =>
  `verify_new_email:${userId}:${accountTokenId}`;

/** Notifications (not dedupable actions) — unique per occurrence, not per token. */
export const passwordChangedIdempotencyKey = (userId: string): string =>
  `password_changed:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

export const emailChangedNoticeIdempotencyKey = (userId: string): string =>
  `email_changed_notice:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

/**
 * Keyed on the scheduled purge timestamp rather than the clock: re-requesting
 * deletion while one is already pending resolves to the same key, so a
 * double-submit cannot produce two conflicting deadline emails.
 */
export const accountDeletionScheduledIdempotencyKey = (userId: string, scheduledAt: Date): string =>
  `account_deletion_scheduled:${userId}:${scheduledAt.getTime()}`;

export const accountDeletionCancelledIdempotencyKey = (userId: string): string =>
  `account_deletion_cancelled:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
