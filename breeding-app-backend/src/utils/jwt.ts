import jwt from "jsonwebtoken";
import type { AuthTokenPayload } from "../types/auth";
import { env } from "../config/env";

export const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: "15m" });

export const verifyAuthToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.jwtSecret) as AuthTokenPayload;

export const signRefreshToken = (payload: AuthTokenPayload): string =>
  jwt.sign({ ...payload, type: "refresh" }, env.jwtSecret, { expiresIn: "7d" });

export const verifyRefreshToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, env.jwtSecret) as AuthTokenPayload & { type?: string };
  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return { sub: decoded.sub, email: decoded.email, role: decoded.role };
};
