import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/errors";

const getErrorDetail = (error: unknown): { status?: number; type?: string } => {
  if (!error || typeof error !== "object") return {};
  const detail = error as { status?: unknown; statusCode?: unknown; type?: unknown };
  const status = typeof detail.status === "number"
    ? detail.status
    : (typeof detail.statusCode === "number" ? detail.statusCode : undefined);
  const type = typeof detail.type === "string" ? detail.type : undefined;
  return { status, type };
};

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }

  const detail = getErrorDetail(error);
  if (detail.status === 413 || detail.type === "entity.too.large") {
    res.status(413).json({
      message: "Cloud sync payload is too large. Remove embedded images or reduce saved media before syncing again.",
    });
    return;
  }

  if (detail.status === 400 && error instanceof SyntaxError) {
    res.status(400).json({ message: "Cloud sync request contains invalid JSON." });
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
