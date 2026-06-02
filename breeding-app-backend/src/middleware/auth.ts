import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { normalizePersistedRole } from "../auth/identity";
import { validateCsrfForCookieAuth } from "./csrf";
import { AUTH_ACCESS_COOKIE, getCookieValue } from "../utils/authCookies";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const cookieToken = bearerToken ? "" : getCookieValue(req, AUTH_ACCESS_COOKIE);
  const token = bearerToken || cookieToken;
  const authSource = bearerToken ? "bearer" : "cookie";

  if (!token) {
    res.status(401).json({ message: "Missing Bearer token" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const persistedRole = payload.persistedRole || payload.role;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: normalizePersistedRole(persistedRole),
      persistedRole,
    };
    req.authSource = authSource;

    if (!validateCsrfForCookieAuth(req, res)) return;

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
