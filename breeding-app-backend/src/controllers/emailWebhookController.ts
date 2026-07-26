import type { Request, Response } from "express";
import { env } from "../config/env";
import { verifyResendWebhookSignature, processResendWebhookEvent } from "../email/webhookService";

export const handleResendWebhook = async (req: Request, res: Response): Promise<void> => {
  if (!env.email.resendWebhookSecret) {
    console.error("[email-webhook] RESEND_WEBHOOK_SECRET is not configured; rejecting webhook.");
    res.status(503).json({ message: "Webhook processing is not configured." });
    return;
  }

  const svixId = String(req.headers["svix-id"] || "");
  const svixTimestamp = String(req.headers["svix-timestamp"] || "");
  const svixSignature = String(req.headers["svix-signature"] || "");

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!rawBody) {
    console.warn("[email-webhook] missing raw body");
    res.status(400).json({ message: "Invalid webhook payload." });
    return;
  }

  const validSignature = verifyResendWebhookSignature(
    rawBody,
    { svixId, svixTimestamp, svixSignature },
    env.email.resendWebhookSecret
  );
  if (!validSignature) {
    console.warn("[email-webhook] signature verification failed", { hasSvixId: Boolean(svixId) });
    res.status(401).json({ message: "Invalid webhook signature." });
    return;
  }

  let payload: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ message: "Malformed webhook payload." });
    return;
  }

  if (!payload.type) {
    res.status(400).json({ message: "Malformed webhook payload." });
    return;
  }

  const result = await processResendWebhookEvent(svixId, payload as { type: string; created_at?: string; data?: { email_id?: string } });
  res.status(200).json({ received: true, outcome: result.outcome });
};
