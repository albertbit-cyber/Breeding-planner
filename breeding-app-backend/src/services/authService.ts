import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { signAuthToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import jwt from "jsonwebtoken";
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

type UserEntity = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: PersistedAppRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const publicUser = (user: UserEntity) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const normalizeFullName = (value: string) =>
  String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

export const registerUser = async (input: {
  email: string;
  password: string;
  fullName: string;
  role?: Extract<AppRole, "breeder" | "buyer">;
}) => {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) {
    throw new HttpError(409, "Email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      role: input.role || "breeder",
      isActive: true,
    },
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

export const changeEmailForUser = async (userId: string, input: { email: string; currentPassword: string }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, "Current password is incorrect.");
  }

  if (input.email !== user.email) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists && exists.id !== user.id) {
      throw new HttpError(409, "Email already exists.");
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: input.email,
      emailVerified: false,
      refreshToken: null,
    },
  });
  await revokeRefreshSessionsForUser(user.id);
  await recordSecurityEvent({
    type: "auth.email_change.success",
    actorUserId: user.id,
    outcome: "success",
    metadata: { previousEmail: user.email, email: input.email },
  });
  return { user: publicUser(updated), message: "Email updated. Please sign in again on your other devices." };
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
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      refreshToken: null,
    },
  });
  await revokeRefreshSessionsForUser(user.id);
  await recordSecurityEvent({
    type: "auth.password_change.success",
    actorUserId: user.id,
    outcome: "success",
  });
  return { user: publicUser(updated), message: "Password updated. Please sign in again on your other devices." };
};

export const recoverPassword = async (input: {
  email: string;
  fullName: string;
  newPassword: string;
}) => {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive || normalizeFullName(user.fullName) !== normalizeFullName(input.fullName)) {
    throw new HttpError(404, "We couldn't verify that account.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      refreshToken: null,
    },
  });
  await recordSecurityEvent({
    type: "auth.password_recovery.success",
    actorUserId: user.id,
    outcome: "success",
  });

  return { message: "Password updated. You can sign in with your new password." };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }
  return publicUser(user);
};

export const signEmailVerificationToken = (user: { id: string; email: string }): string =>
  jwt.sign({ sub: user.id, email: user.email, type: "email_verification" }, env.jwtSecret, { expiresIn: "48h" });

export const verifyEmailForUser = async (token: string) => {
  let decoded: { sub?: string; email?: string; type?: string };
  try {
    decoded = jwt.verify(token, env.jwtSecret) as { sub?: string; email?: string; type?: string };
  } catch {
    throw new HttpError(400, "Email verification link is invalid or expired.");
  }
  if (decoded.type !== "email_verification" || !decoded.sub || !decoded.email) {
    throw new HttpError(400, "Email verification link is invalid.");
  }
  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user || user.email !== decoded.email) {
    throw new HttpError(400, "Email verification link no longer matches this account.");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  await recordSecurityEvent({
    type: "auth.email_verified",
    actorUserId: user.id,
    outcome: "success",
  });
  return { user: publicUser(updated), message: "Email verified." };
};
