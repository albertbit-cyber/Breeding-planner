import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { env } from "../config/env";

export const AUTH_ACCESS_COOKIE = "bp_access_token";
export const AUTH_REFRESH_COOKIE = "bp_refresh_token";
export const CSRF_COOKIE = "bp_csrf_token";
export const CSRF_HEADER = "x-csrf-token";

// Deployed environments run over HTTPS and need Secure cookies; local dev runs
// plain HTTP. SameSite defaults to "lax", which is correct once the frontend
// reaches the backend through a same-origin proxy — see env.authCookieSameSite
// for the escape hatch during the proxy rollout. Bearer-token auth (the current
// default on every platform) never reads these cookies, so this only affects
// the httpOnly-cookie auth path once a frontend is switched onto it.
const isDeployed = () => env.nodeEnv !== "development";

const cookieOptions = (maxAgeMs?: number, httpOnly = true) => ({
  httpOnly,
  secure: isDeployed(),
  sameSite: isDeployed() ? env.authCookieSameSite : ("lax" as const),
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
