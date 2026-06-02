import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    res.status(401).json({ message: "Missing Bearer token" });
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
