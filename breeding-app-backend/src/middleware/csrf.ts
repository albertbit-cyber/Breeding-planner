import type { Request, Response } from "express";
import { CSRF_COOKIE, CSRF_HEADER, getCookieValue } from "../utils/authCookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const validateCsrfForCookieAuth = (req: Request, res: Response): boolean => {
  if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) return true;
  if (req.authSource !== "cookie") return true;

  const cookieToken = getCookieValue(req, CSRF_COOKIE);
  const headerToken = String(req.headers[CSRF_HEADER] || "").trim();
  if (cookieToken && headerToken && cookieToken === headerToken) return true;

  res.status(403).json({ message: "CSRF token is required for cookie-authenticated write requests." });
  return false;
};

