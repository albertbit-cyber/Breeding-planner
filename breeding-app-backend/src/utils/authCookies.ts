import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { env } from "../config/env";

export const AUTH_ACCESS_COOKIE = "bp_access_token";
export const AUTH_REFRESH_COOKIE = "bp_refresh_token";
export const CSRF_COOKIE = "bp_csrf_token";
export const CSRF_HEADER = "x-csrf-token";

// Every deployed environment (production, staging, ...) is accessed cross-origin
// over HTTPS, so cookies need Secure+SameSite=None there. Only plain local
// development runs the frontend and backend same-site over HTTP.
const isDeployed = () => env.nodeEnv !== "development";

const cookieOptions = (maxAgeMs?: number, httpOnly = true) => ({
  httpOnly,
  secure: isDeployed(),
  sameSite: isDeployed() ? "none" as const : "lax" as const,
  path: "/",
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

export const parseCookies = (req: Request): Record<string, string> => {
  const header = String(req.headers.cookie || "");
  return header.split(";").reduce<Record<string, string>>((cookies, item) => {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (!rawName) return cookies;
    cookies[decodeURIComponent(rawName)] = decodeURIComponent(rawValue.join("=") || "");
    return cookies;
  }, {});
};

export const getCookieValue = (req: Request, name: string): string =>
  parseCookies(req)[name] || "";

export const setAuthCookies = (res: Response, tokens: { token: string; refreshToken: string }): void => {
  res.cookie(AUTH_ACCESS_COOKIE, tokens.token, cookieOptions(15 * 60 * 1000));
  res.cookie(AUTH_REFRESH_COOKIE, tokens.refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(AUTH_ACCESS_COOKIE, cookieOptions());
  res.clearCookie(AUTH_REFRESH_COOKIE, cookieOptions());
  res.clearCookie(CSRF_COOKIE, cookieOptions(undefined, false));
};

export const createCsrfToken = (): string => {
  return randomBytes(24).toString("hex");
};

export const setCsrfCookie = (res: Response, token: string): void => {
  res.cookie(CSRF_COOKIE, token, cookieOptions(2 * 60 * 60 * 1000, false));
};
