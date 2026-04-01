import jwt from "jsonwebtoken";
import type { AuthTokenPayload } from "../types/auth";
import { env } from "../config/env";

export const signAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.jwtSecret, { expiresIn: "12h" });

export const verifyAuthToken = (token: string): AuthTokenPayload =>
  jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
