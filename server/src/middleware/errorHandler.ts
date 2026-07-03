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

  console.error("Unhandled error:", error);
  res.status(500).json({ message: "Internal server error" });
};
