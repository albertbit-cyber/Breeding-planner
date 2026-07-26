import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { signAuthToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { env } from "../config/env";
import { normalizePersistedRole } from "../auth/identity";
import type { AppRole, PersistedAppRole } from "../types/auth";
import {
  createRefreshSession,
  hashRefreshToken,
  findActiveRefreshSession,
  matchesStoredRefreshToken,
  revokeRefreshSessionsForUser,
  rotateRefreshSession,
} from "./refreshTokenSessionService";
import { recordSecurityEvent } from "./securityEventService";
import { issueToken, consumeToken, revokeAllForPurpose } from "./accountTokenService";
import { enqueueEmail } from "../email/queueService";
import { maskEmail } from "../utils/maskEmail";
import {
  ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY,
  ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION,
  ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY,
  ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION,
  ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY,
  ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION,
  ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY,
  ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION,
  ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY,
  ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION,
} from "../email/templates";
import {
  emailVerificationIdempotencyKey,
  passwordResetIdempotencyKey,
  passwordChangedIdempotencyKey,
  verifyNewEmailIdempotencyKey,
  emailChangedNoticeIdempotencyKey,
} from "../email/idempotency";

const VERIFY_EMAIL_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
const VERIFY_NEW_EMAIL_TTL_MS = 48 * 60 * 60 * 1000;

type UserEntity = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: PersistedAppRole;
  isActive: boolean;
  emailVerified: boolean;
  pendingEmail?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const publicUser = (user: UserEntity) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  isActive: user.isActive,
  emailVerified: Boolean(user.emailVerified),
  pendingEmail: user.pendingEmail ? maskEmail(user.pendingEmail) : null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const publicAppBaseUrl = (): string => String(env.publicAppUrl || "").replace(/\/$/, "");

const verifyEmailActionUrl = (rawToken: string): string =>
  `${publicAppBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;

const resetPasswordActionUrl = (rawToken: string): string =>
  `${publicAppBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

const confirmEmailChangeActionUrl = (rawToken: string): string =>
  `${publicAppBaseUrl()}/confirm-email-change?token=${encodeURIComponent(rawToken)}`;

/** Issues a fresh verify_email token (superseding any prior one) and queues the verification email. */
const queueVerificationEmail = async (user: { id: string; email: string; fullName: string }) => {
  const { rawToken, record } = await issueToken(user.id, "verify_email", user.email, VERIFY_EMAIL_TTL_MS);
  return enqueueEmail({
    ownerId: user.id,
    recipientEmail: user.email,
    category: "account_and_security",
    templateKey: ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_KEY,
    templateVersion: ACCOUNT_EMAIL_VERIFICATION_TEMPLATE_VERSION,
    templatePayload: {
      fullName: user.fullName,
      actionUrl: verifyEmailActionUrl(rawToken),
      expiresInHoursDisplay: "48 hours",
    },
    subject: "Verify your Breeding Planner email address",
    idempotencyKey: emailVerificationIdempotencyKey(user.id, record.id),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });
};

export const registerUser = async (input: {
  email: string;
  password: string;
  fullName: string;
  role?: Extract<AppRole, "breeder" | "buyer">;
}) => {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (!existing.emailVerified) {
      // Someone is re-registering an address that signed up but never verified —
      // don't create a second account; just refresh the verification email.
      await queueVerificationEmail(existing);
      await recordSecurityEvent({
        type: "auth.registration_conflict",
        actorUserId: existing.id,
        outcome: "blocked",
        reason: "unverified_duplicate",
        metadata: { email },
      });
      throw new HttpError(409, "An account with this email already exists but hasn't been verified yet. We've sent a new verification link.");
    }
    throw new HttpError(409, "Email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      fullName: input.fullName,
      passwordHash,
      role: input.role || "breeder",
      isActive: true,
    },
  });

  await recordSecurityEvent({ type: "auth.registered", actorUserId: user.id, outcome: "success", metadata: { email } });
  const job = await queueVerificationEmail(user);
  await recordSecurityEvent({
    type: "auth.verification_email_queued",
    actorUserId: user.id,
    outcome: "success",
    metadata: { jobId: job?.id },
  });

  return publicUser(user);
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Invalid credentials.");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, "Invalid credentials.");
  }

  const tokenPayload = {
    sub: user.id,
    email: user.email,
    role: normalizePersistedRole(user.role),
    persistedRole: user.role,
  };
  const token = signAuthToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  await (prisma as any).user.update({
    where: { id: user.id },
    data: { refreshToken: hashRefreshToken(refreshToken), lastLoginAt: new Date(), status: "active" },
  });
  await createRefreshSession(user.id, refreshToken);
  await recordSecurityEvent({
    type: "auth.login.success",
    actorUserId: user.id,
    outcome: "success",
    metadata: { email: user.email, role: user.role },
  });

  return {
    token,
    refreshToken,
    user: publicUser(user),
  };
};

export const refreshAuthToken = async (incomingRefreshToken: string) => {
  const payload = verifyRefreshToken(incomingRefreshToken);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Invalid refresh token.");
  }

  // Cast to access refreshToken field (present after migration).
  const storedToken = (user as unknown as { refreshToken: string | null }).refreshToken;
  const refreshSession = await findActiveRefreshSession(user.id, incomingRefreshToken);
  const legacyRefreshTokenMatches = matchesStoredRefreshToken(storedToken, incomingRefreshToken);
  if (!refreshSession && !legacyRefreshTokenMatches) {
    await recordSecurityEvent({
      type: "auth.refresh.revoked_or_reused",
      actorUserId: user.id,
      outcome: "blocked",
      reason: "stored refresh token did not match incoming token",
    });
    throw new HttpError(401, "Refresh token has been revoked.");
  }

  const tokenPayload = {
    sub: user.id,
    email: user.email,
    role: normalizePersistedRole(user.role),
    persistedRole: user.role,
  };
  const token = signAuthToken(tokenPayload);
  const newRefreshToken = signRefreshToken(tokenPayload);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: hashRefreshToken(newRefreshToken) },
  });
  if (refreshSession) {
    await rotateRefreshSession(user.id, incomingRefreshToken, newRefreshToken);
  } else {
    await createRefreshSession(user.id, newRefreshToken);
  }
  await recordSecurityEvent({
    type: "auth.refresh.success",
    actorUserId: user.id,
    outcome: "success",
  });

  return { token, refreshToken: newRefreshToken };
};

export const logoutUser = async (userId: string) => {
  if (!userId) return { message: "Signed out." };
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  }).catch(() => null);
  await revokeRefreshSessionsForUser(userId);
  await recordSecurityEvent({
    type: "auth.logout",
    actorUserId: userId,
    outcome: "success",
  });
  return { message: "Signed out." };
};

/**
 * Requests a change of the account's email address. Does NOT flip `email`
 * immediately — the old address stays fully active until the new one is
 * verified via `confirmEmailChange`.
 */
export const changeEmailForUser = async (userId: string, input: { email: string; currentPassword: string }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, "Current password is incorrect.");
  }

  const newEmail = input.email.trim().toLowerCase();
  if (newEmail === user.email) {
    throw new HttpError(400, "This is already your current email address.");
  }

  const exists = await prisma.user.findUnique({ where: { email: newEmail } });
  if (exists && exists.id !== user.id) {
    throw new HttpError(409, "Email already exists.");
  }

  const updated = await (prisma as any).user.update({
    where: { id: user.id },
    data: { pendingEmail: newEmail, pendingEmailRequestedAt: new Date() },
  });

  const { rawToken, record } = await issueToken(user.id, "verify_new_email", newEmail, VERIFY_NEW_EMAIL_TTL_MS);
  await enqueueEmail({
    ownerId: user.id,
    recipientEmail: newEmail,
    category: "account_and_security",
    templateKey: ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_KEY,
    templateVersion: ACCOUNT_VERIFY_NEW_EMAIL_TEMPLATE_VERSION,
    templatePayload: {
      fullName: user.fullName,
      actionUrl: confirmEmailChangeActionUrl(rawToken),
      expiresInHoursDisplay: "48 hours",
    },
    subject: "Confirm your new Breeding Planner email address",
    idempotencyKey: verifyNewEmailIdempotencyKey(user.id, record.id),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });

  await recordSecurityEvent({
    type: "auth.email_change_requested",
    actorUserId: user.id,
    outcome: "success",
    metadata: { currentEmail: user.email, pendingEmail: newEmail },
  });

  return {
    user: publicUser(updated),
    message: "Check your new email address for a confirmation link. Your current email stays active until you confirm.",
  };
};

/** Consumes a verify_new_email token and completes a pending email-address change. */
export const confirmEmailChange = async (rawToken: string) => {
  const result = await consumeToken(rawToken, "verify_new_email");

  if (result.status === "invalid") {
    throw new HttpError(400, "This email-change link is invalid.");
  }
  if (result.status === "expired") {
    throw new HttpError(400, "This email-change link has expired. Request the change again from your account settings.");
  }
  if (result.status === "revoked") {
    throw new HttpError(400, "This email-change link is no longer valid. Request the change again from your account settings.");
  }
  if (result.status === "already_consumed") {
    return { message: "This email address has already been confirmed." };
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    throw new HttpError(400, "This account no longer exists.");
  }
  if (!(user as any).pendingEmail || (user as any).pendingEmail !== result.emailAddress) {
    throw new HttpError(400, "This email-change request is no longer active.");
  }

  const stillAvailable = await prisma.user.findUnique({ where: { email: result.emailAddress } });
  if (stillAvailable && stillAvailable.id !== user.id) {
    await (prisma as any).user.update({
      where: { id: user.id },
      data: { pendingEmail: null, pendingEmailRequestedAt: null },
    });
    throw new HttpError(409, "This email address is no longer available. Please request the change again with a different address.");
  }

  const previousEmail = user.email;
  const updated = await (prisma as any).user.update({
    where: { id: user.id },
    data: {
      email: result.emailAddress,
      pendingEmail: null,
      pendingEmailRequestedAt: null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  await revokeAllForPurpose(user.id, "verify_new_email");
  await recordSecurityEvent({
    type: "auth.email_change.success",
    actorUserId: user.id,
    outcome: "success",
    metadata: { previousEmail, email: result.emailAddress },
  });

  await enqueueEmail({
    ownerId: user.id,
    recipientEmail: previousEmail,
    category: "account_and_security",
    templateKey: ACCOUNT_EMAIL_CHANGED_TEMPLATE_KEY,
    templateVersion: ACCOUNT_EMAIL_CHANGED_TEMPLATE_VERSION,
    templatePayload: {
      fullName: user.fullName,
      changedAtDisplay: new Date().toUTCString(),
      maskedNewEmail: maskEmail(result.emailAddress),
    },
    subject: "Your Breeding Planner account email was changed",
    idempotencyKey: emailChangedNoticeIdempotencyKey(user.id),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });

  return { user: publicUser(updated), message: "Email address confirmed and updated." };
};

export const changePasswordForUser = async (userId: string, input: { currentPassword: string; newPassword: string }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, "Current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  const updated = await (prisma as any).user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
      refreshToken: null,
    },
  });
  await revokeRefreshSessionsForUser(user.id);
  await revokeAllForPurpose(user.id, "reset_password");
  await recordSecurityEvent({
    type: "auth.password_change.success",
    actorUserId: user.id,
    outcome: "success",
  });

  await enqueueEmail({
    ownerId: user.id,
    recipientEmail: user.email,
    category: "account_and_security",
    templateKey: ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY,
    templateVersion: ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION,
    templatePayload: { fullName: user.fullName, changedAtDisplay: new Date().toUTCString() },
    subject: "Your Breeding Planner password was changed",
    idempotencyKey: passwordChangedIdempotencyKey(user.id),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });

  return { user: publicUser(updated), message: "Password updated. Please sign in again on your other devices." };
};

const GENERIC_RESET_MESSAGE = "If that email is registered, a reset link has been sent.";

export const requestPasswordReset = async (email: string) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Always respond the same way — don't reveal whether the email exists, its
  // verification state, or its active/disabled status.
  if (!user || !user.isActive) {
    return { message: GENERIC_RESET_MESSAGE };
  }

  const { rawToken, record } = await issueToken(user.id, "reset_password", user.email, RESET_PASSWORD_TTL_MS);

  await enqueueEmail({
    ownerId: user.id,
    recipientEmail: user.email,
    category: "account_and_security",
    templateKey: ACCOUNT_PASSWORD_RESET_TEMPLATE_KEY,
    templateVersion: ACCOUNT_PASSWORD_RESET_TEMPLATE_VERSION,
    templatePayload: {
      fullName: user.fullName,
      actionUrl: resetPasswordActionUrl(rawToken),
      expiresInMinutesDisplay: "60 minutes",
    },
    subject: "Reset your Breeding Planner password",
    idempotencyKey: passwordResetIdempotencyKey(user.id, record.id),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });

  await recordSecurityEvent({ type: "auth.password_reset_requested", actorUserId: user.id, outcome: "success" });
  return { message: GENERIC_RESET_MESSAGE };
};

export const resetPassword = async (input: { token: string; newPassword: string }) => {
  const result = await consumeToken(input.token, "reset_password");

  if (result.status === "invalid") {
    throw new HttpError(400, "This reset link is invalid.");
  }
  if (result.status === "expired") {
    throw new HttpError(400, "This reset link has expired. Request a new one.");
  }
  if (result.status === "revoked") {
    throw new HttpError(400, "This reset link is no longer valid. Request a new one.");
  }
  if (result.status === "already_consumed") {
    throw new HttpError(400, "This reset link has already been used.");
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user || !user.isActive) {
    throw new HttpError(400, "This reset link is invalid or has expired.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await (prisma as any).user.update({
    where: { id: user.id },
    data: { passwordHash, passwordChangedAt: new Date(), refreshToken: null },
  });
  await revokeRefreshSessionsForUser(user.id);
  await recordSecurityEvent({ type: "auth.password_reset.success", actorUserId: user.id, outcome: "success" });

  await enqueueEmail({
    ownerId: user.id,
    recipientEmail: user.email,
    category: "account_and_security",
    templateKey: ACCOUNT_PASSWORD_CHANGED_TEMPLATE_KEY,
    templateVersion: ACCOUNT_PASSWORD_CHANGED_TEMPLATE_VERSION,
    templatePayload: { fullName: user.fullName, changedAtDisplay: new Date().toUTCString() },
    subject: "Your Breeding Planner password was changed",
    idempotencyKey: passwordChangedIdempotencyKey(user.id),
    relatedEntityType: "user",
    relatedEntityId: user.id,
  });

  return { message: "Password updated. You can now sign in with your new password." };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }
  return publicUser(user);
};

export const verifyEmailForUser = async (rawToken: string) => {
  const result = await consumeToken(rawToken, "verify_email");

  if (result.status === "invalid") {
    throw new HttpError(400, "Email verification link is invalid.");
  }
  if (result.status === "expired") {
    throw new HttpError(400, "Email verification link has expired. Request a new one.");
  }
  if (result.status === "revoked") {
    throw new HttpError(400, "Email verification link is no longer valid. Request a new one.");
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) {
    throw new HttpError(400, "This account no longer exists.");
  }

  if (result.status === "already_consumed" || user.emailVerified) {
    return { user: publicUser(user), message: "Email already verified.", alreadyVerified: true };
  }

  const updated = await (prisma as any).user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  await recordSecurityEvent({
    type: "auth.email_verified",
    actorUserId: user.id,
    outcome: "success",
  });
  return { user: publicUser(updated), message: "Email verified.", alreadyVerified: false };
};

const GENERIC_RESEND_MESSAGE = "If that email is registered and unverified, a new verification link has been sent.";

/** Self-service resend of the verification email. Generic response — never reveals whether the address exists or its verification state. */
export const resendVerificationEmail = async (email: string) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.isActive || user.emailVerified) {
    return { message: GENERIC_RESEND_MESSAGE };
  }

  const job = await queueVerificationEmail(user);
  await recordSecurityEvent({
    type: "auth.verification_email_resent",
    actorUserId: user.id,
    outcome: "success",
    metadata: { jobId: job?.id },
  });

  return { message: GENERIC_RESEND_MESSAGE };
};
