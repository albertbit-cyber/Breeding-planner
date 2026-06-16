import { Router } from "express";
import { env } from "../config/env";
import { checkDatabaseConnection } from "../lib/database";
import { asyncHandler } from "../middleware/asyncHandler";

export const systemRoutes = Router();

systemRoutes.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    ok: true,
    service: "breeding-planner-shared-backend",
    timestamp: new Date().toISOString(),
  });
});

systemRoutes.get(
  "/db-check",
  asyncHandler(async (_req, res) => {
    if (env.nodeEnv === "production") {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const result = await checkDatabaseConnection();
    res.status(result.ok ? 200 : 503).json({
      status: result.ok ? "ok" : "degraded",
      service: "breeding-planner-shared-backend",
      ...result,
    });
  })
);
