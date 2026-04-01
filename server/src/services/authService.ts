import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { signAuthToken } from "../utils/jwt";

type UserEntity = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: "admin" | "lab" | "breeder";
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

export const registerUser = async (input: {
  email: string;
  password: string;
  fullName: string;
  role?: "admin" | "lab" | "breeder";
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

  // Temporary debug log requested.
  console.log("[auth] user login", { email: user.email, role: user.role });

  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    token,
    user: publicUser(user),
  };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(404, "User not found.");
  }
  return publicUser(user);
};
