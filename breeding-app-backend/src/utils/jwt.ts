import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import type { AuthTokenPayload } from "../types/auth";
import { env } from "../config/env";

export const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: "15m" });

export const verifyAuthToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.jwtSecret) as AuthTokenPayload;

export const signRefreshToken = (payload: AuthTokenPayload): string =>
  jwt.sign({ ...payload, type: "refresh", jti: randomUUID() }, env.jwtSecret, { expiresIn: "7d" });

export const verifyRefreshToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, env.jwtSecret) as AuthTokenPayload & { type?: string };
  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  // `portal` is carried through deliberately: a refresh must renew the session
  // it was given, not silently upgrade it to a different surface.
  return { sub: decoded.sub, email: decoded.email, role: decoded.role, portal: decoded.portal };
};
