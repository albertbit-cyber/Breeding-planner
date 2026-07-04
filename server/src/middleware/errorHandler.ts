import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  const bodyParserError = error as { type?: string; status?: number; message?: string };
  if (bodyParserError?.type === "entity.too.large" || bodyParserError?.status === 413) {
    res.status(413).json({ message: "Request payload too large. Try syncing fewer records or removing large photos." });
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

  const detail = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  console.error("Unhandled error:", detail, error);
  res.status(500).json({ message: "Internal server error" });
};
