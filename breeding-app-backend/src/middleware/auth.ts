import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { normalizePersistedRole } from "../auth/identity";
import { validateCsrfForCookieAuth } from "./csrf";
import { AUTH_ACCESS_COOKIE, getCookieValue } from "../utils/authCookies";
import { prisma } from "../lib/prisma";

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

/**
 * Gates a short, explicit allowlist of sensitive write routes behind email
 * verification. Requires a DB read (the access JWT deliberately doesn't
 * carry `emailVerified`, to keep its payload minimal/stable) — only applied
 * to a few routes, not the whole app. Must run after `requireAuth`.
 */
export const requireVerifiedEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Missing Bearer token" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user || !user.emailVerified) {
    res.status(403).json({ message: "Please verify your email address before doing this." });
    return;
  }
  next();
};
