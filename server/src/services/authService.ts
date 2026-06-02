import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { signAuthToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import type { AppRole } from "../types/auth";

type UserEntity = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: AppRole;
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
  role?: AppRole;
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

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const token = signAuthToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  await (prisma as any).user.update({
    where: { id: user.id },
    data: { refreshToken, lastLoginAt: new Date(), status: "active" },
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
  if (!storedToken || storedToken !== incomingRefreshToken) {
    throw new HttpError(401, "Refresh token has been revoked.");
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const token = signAuthToken(tokenPayload);
  const newRefreshToken = signRefreshToken(tokenPayload);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newRefreshToken },
  });

  return { token, refreshToken: newRefreshToken };
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

  return { message: "Password updated. You can sign in with your new password." };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }
  return publicUser(user);
};
