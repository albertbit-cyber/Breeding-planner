import { Router } from "express";
import express from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { billingStatus, checkoutSession, portalSession, stripeWebhook } from "../controllers/billingController";

export const billingRoutes = Router();

billingRoutes.get("/status", requireAuth, asyncHandler(billingStatus));
billingRoutes.post("/checkout-session", requireAuth, asyncHandler(checkoutSession));
billingRoutes.post("/portal-session", requireAuth, asyncHandler(portalSession));

// Raw body is required for Stripe signature verification, so this router is
// mounted ahead of the global express.json() parser (see app.ts).
export const billingWebhookRoutes = Router();

billingWebhookRoutes.post("/", express.raw({ type: "*/*", limit: "1mb" }), asyncHandler(stripeWebhook));
