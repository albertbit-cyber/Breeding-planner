import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { normalizePersistedRole } from "../auth/identity";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

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

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
