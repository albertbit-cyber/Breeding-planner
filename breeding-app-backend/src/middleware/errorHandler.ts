import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { verifyAuthToken } from "../utils/jwt";
import { AUTH_ACCESS_COOKIE, getCookieValue } from "../utils/authCookies";

const getErrorDetail = (error: unknown): { status?: number; type?: string; length?: number } => {
  if (!error || typeof error !== "object") return {};
  const detail = error as { status?: unknown; statusCode?: unknown; type?: unknown; length?: unknown };
  const status = typeof detail.status === "number"
    ? detail.status
    : (typeof detail.statusCode === "number" ? detail.statusCode : undefined);
  const type = typeof detail.type === "string" ? detail.type : undefined;
  const length = typeof detail.length === "number" ? detail.length : undefined;
  return { status, type, length };
};

// Best-effort caller identity for the oversized-payload log line below. Auth middleware
// hasn't run yet at this point (body parsing rejects before routing), so this repeats the
// same token verification requireAuth does, purely for logging — never trusted for access.
const identifyCallerForLogging = (req: Request): string => {
  try {
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = bearerToken || getCookieValue(req, AUTH_ACCESS_COOKIE);
    if (!token) return "unknown";
    const payload = verifyAuthToken(token);
    return payload.email || payload.sub || "unknown";
  } catch {
    return "unknown";
  }
};

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  const detail = getErrorDetail(error);
  if (detail.status === 413 || detail.type === "entity.too.large") {
    const contentLength = req.headers["content-length"];
    console.warn(
      `[cloud-sync] 413 payload too large: path=${req.path} caller=${identifyCallerForLogging(req)} ` +
      `content-length=${contentLength || "unknown"} parser-measured-length=${detail.length ?? "unknown"}`
    );
    res.status(413).json({
      message: "Cloud sync payload is too large. Photos are already excluded from sync — this account has more breeding/log history than a single sync request can carry. Contact support if this keeps happening.",
    });
    return;
  }

  if (detail.status === 400 && error instanceof SyntaxError) {
    res.status(400).json({ message: "Cloud sync request contains invalid JSON." });
    return;
  }

  if (error instanceof Error && (
    error.name === "JsonWebTokenError" ||
    error.name === "TokenExpiredError" ||
    error.name === "NotBeforeError"
  )) {
    res.status(401).json({ message: "Session expired. Please log in again." });
    return;
  }

  const prismaCode = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (prismaCode === "P2021" || prismaCode === "P2022") {
    console.error("Database schema error:", error);
    res.status(503).json({ message: "Server database needs an update before cloud sync can run. Please run backend migrations and try again." });
    return;
  }

  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error("Unhandled error:", detail, error);
  res.status(500).json({ message: "Internal server error" });
};
