import { Router } from "express";
import express from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { handleResendWebhook } from "../controllers/emailWebhookController";

export const emailWebhookRoutes = Router();

// Raw body is required for signature verification — this route must be mounted
// before the global express.json() body parser (see app.ts).
emailWebhookRoutes.post("/resend", express.raw({ type: "*/*", limit: "2mb" }), asyncHandler(handleResendWebhook));
