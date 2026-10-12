import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import {
  constructWebhookEvent,
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
  handleStripeEvent,
} from "../services/billingService";

export const billingStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(200).json(await getBillingStatus(req.user));
};

export const checkoutSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createCheckoutSession(req.user, req.body || {}));
};

export const portalSession = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  res.status(201).json(await createPortalSession(req.user));
};

export const stripeWebhook = async (req: Request, res: Response): Promise<void> => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const event = await constructWebhookEvent(rawBody, String(req.headers["stripe-signature"] || ""));
  try {
    const result = await handleStripeEvent(event);
    res.status(200).json({ received: true, ...result });
  } catch (error) {
    // A 500 makes Stripe retry, which is what a transient database failure needs.
    console.error("[billing] webhook handling failed", { type: event.type, id: event.id, error });
    throw error;
  }
};
