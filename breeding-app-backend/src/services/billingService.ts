import type Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/errors";
import { DEFAULT_TIER_KEY } from "./subscriptionService";

const db = prisma as any;

/**
 * Stripe billing for the four self-serve tiers.
 *
 * Nothing here is allowed to make a purchase look possible when it is not.
 * Billing counts as configured only when the secret key, the webhook secret and
 * at least one tier price are all present; otherwise every route answers that
 * plans are not purchasable yet, and the webhook refuses to process anything it
 * cannot verify. A live secret key is refused unless STRIPE_ALLOW_LIVE=true, so
 * a key pasted into the wrong environment cannot start charging cards.
 *
 * Config is read from the environment on every call rather than once at boot,
 * so tests (and a Railway variable change followed by a restart) see one source.
 *
 * Stripe is the source of truth for what was paid. UserSubscription only mirrors
 * it, and only from verified webhooks: the checkout redirect proves nothing, so
 * the app never upgrades an account on the way back from Stripe.
 */

/** The tiers a breeder can buy without talking to anyone. Free costs nothing; lab and enterprise are sold by hand. */
export const SELF_SERVE_TIER_KEYS = ["hobby", "hobby_plus", "breeder", "professional_breeder"] as const;
export type SelfServeTierKey = (typeof SELF_SERVE_TIER_KEYS)[number];

const envName = (tierKey: string) => tierKey.toUpperCase();

export type BillingConfig = {
  configured: boolean;
  mode: "test" | "live" | "off";
  reason: string;
  secretKey: string;
  webhookSecret: string;
  prices: Partial<Record<SelfServeTierKey, string>>;
  foundingPrices: Partial<Record<SelfServeTierKey, string>>;
  foundingCouponId: string;
  returnUrl: string;
};

export const getBillingConfig = (): BillingConfig => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const allowLive = String(process.env.STRIPE_ALLOW_LIVE || "").trim().toLowerCase() === "true";
  const prices: BillingConfig["prices"] = {};
  const foundingPrices: BillingConfig["foundingPrices"] = {};
  for (const key of SELF_SERVE_TIER_KEYS) {
    const price = String(process.env[`STRIPE_PRICE_${envName(key)}`] || "").trim();
    const founding = String(process.env[`STRIPE_FOUNDING_PRICE_${envName(key)}`] || "").trim();
    if (price) prices[key] = price;
    if (founding) foundingPrices[key] = founding;
  }
  const returnUrl = String(process.env.BILLING_RETURN_URL || process.env.PUBLIC_APP_URL || process.env.CORS_ORIGIN || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");

  const base = {
    secretKey,
    webhookSecret,
    prices,
    foundingPrices,
    foundingCouponId: String(process.env.STRIPE_FOUNDING_COUPON || "").trim(),
    returnUrl,
  };
  const off = (reason: string): BillingConfig => ({ ...base, configured: false, mode: "off", reason });

  if (!secretKey) return off("STRIPE_SECRET_KEY is not set.");
  const isLive = secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_");
  if (isLive && !allowLive) return off("A live Stripe key is set but STRIPE_ALLOW_LIVE is not true.");
  if (!webhookSecret) return off("STRIPE_WEBHOOK_SECRET is not set.");
  if (!Object.keys(prices).length) return off("No STRIPE_PRICE_<TIER> is set.");
  if (!returnUrl) return off("BILLING_RETURN_URL (or PUBLIC_APP_URL) is not set.");
  return { ...base, configured: true, mode: isLive ? "live" : "test", reason: "" };
};

const NOT_PURCHASABLE = "Plans are not purchasable yet.";

let stripeClient: Stripe | null = null;
let stripeClientKey = "";
const getStripe = async (config: BillingConfig): Promise<Stripe> => {
  if (!stripeClient || stripeClientKey !== config.secretKey) {
    // Loaded on first use, not at import: the SDK is large, and an app with billing off
    // (every deployment today) should not pay for it at boot or in every test that loads app.ts.
    const sdk: any = await import("stripe");
    const StripeSdk = sdk.default ?? sdk;
    stripeClient = new StripeSdk(config.secretKey) as Stripe;
    stripeClientKey = config.secretKey;
  }
  return stripeClient;
};

const requireConfigured = (): BillingConfig => {
  const config = getBillingConfig();
  if (!config.configured) throw new HttpError(503, NOT_PURCHASABLE);
  return config;
};

const LIVE_STATUSES = ["active", "trialing", "paused", "past_due"];

const latestStripeSubscription = (userId: string) => db.userSubscription.findFirst({
  where: { userId, paymentProvider: "stripe", paymentCustomerId: { not: null } },
  orderBy: { updatedAt: "desc" },
});

const isFoundingMember = async (email: string): Promise<boolean> => {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !db.foundingMember) return false;
  const row = await db.foundingMember.findUnique({ where: { email: normalized } });
  return Boolean(row);
};

/** What the Plans tab needs to decide between checkout, the portal, and "not purchasable yet". */
export const getBillingStatus = async (user: { id: string; email?: string }) => {
  const config = getBillingConfig();
  const [stripeRow, account] = await Promise.all([
    latestStripeSubscription(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { email: true } }),
  ]);
  const email = account?.email || user.email || "";
  return {
    configured: config.configured,
    mode: config.mode,
    message: config.configured ? "" : NOT_PURCHASABLE,
    purchasableTierKeys: config.configured ? Object.keys(config.prices) : [],
    foundingMember: await isFoundingMember(email),
    hasBillingAccount: Boolean(stripeRow?.paymentCustomerId),
    hasActivePaidSubscription: Boolean(stripeRow && LIVE_STATUSES.includes(stripeRow.status)),
  };
};

/**
 * Picks what a checkout charges. A founding member gets the tier's founding
 * price when one is mapped, otherwise the regular price with the founding
 * coupon; with neither mapped they pay the regular price, which is the honest
 * failure (the lock is a promise to be kept by configuring it, not by guessing).
 */
export const resolveCheckoutPricing = (config: BillingConfig, tierKey: SelfServeTierKey, founding: boolean) => {
  const regular = config.prices[tierKey];
  if (!regular) return null;
  if (founding && config.foundingPrices[tierKey]) {
    return { price: config.foundingPrices[tierKey] as string, coupon: "", founding: true };
  }
  if (founding && config.foundingCouponId) {
    return { price: regular, coupon: config.foundingCouponId, founding: true };
  }
  return { price: regular, coupon: "", founding: false };
};

export const createCheckoutSession = async (user: { id: string; email?: string }, payload: Record<string, unknown>) => {
  const config = requireConfigured();
  const tierKey = String(payload.tierKey || "").trim().toLowerCase();
  if (!(SELF_SERVE_TIER_KEYS as readonly string[]).includes(tierKey)) {
    throw new HttpError(400, "That plan cannot be bought here.");
  }
  const tier = await db.subscriptionTier.findFirst({
    where: { key: tierKey, isActive: true, isPublic: true, archivedAt: null },
  });
  if (!tier) throw new HttpError(404, "Public subscription tier not found.");

  const account = await db.user.findUnique({ where: { id: user.id }, select: { id: true, email: true } });
  if (!account) throw new HttpError(404, "User not found.");

  const existing = await latestStripeSubscription(user.id);
  if (existing && LIVE_STATUSES.includes(existing.status)) {
    // A second checkout would open a second subscription and bill twice.
    throw new HttpError(409, "You already have a paid plan. Change or cancel it under Manage billing.");
  }

  const founding = await isFoundingMember(account.email);
  const pricing = resolveCheckoutPricing(config, tierKey as SelfServeTierKey, founding);
  if (!pricing) throw new HttpError(503, `${tier.name} is not purchasable yet.`);

  const stripe = await getStripe(config);
  // Refuse a price that would contradict the published plan: monthly, in euros.
  const price = await stripe.prices.retrieve(pricing.price);
  if (String(price.currency).toLowerCase() !== "eur" || price.recurring?.interval !== "month") {
    console.error("[billing] price is not a monthly EUR price", { tierKey, price: pricing.price });
    throw new HttpError(503, `${tier.name} is not purchasable yet.`);
  }

  const metadata = { userId: account.id, tierKey, founding: pricing.founding ? "true" : "false" };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: pricing.price, quantity: 1 }],
    ...(existing?.paymentCustomerId ? { customer: existing.paymentCustomerId } : { customer_email: account.email }),
    client_reference_id: account.id,
    metadata,
    subscription_data: { metadata },
    ...(pricing.coupon ? { discounts: [{ coupon: pricing.coupon }] } : {}),
    success_url: `${config.returnUrl}/#billing=success`,
    cancel_url: `${config.returnUrl}/#billing=cancelled`,
  });
  if (!session.url) throw new HttpError(502, "Stripe did not return a checkout page.");
  return { url: session.url, mode: config.mode, founding: pricing.founding };
};

export const createPortalSession = async (user: { id: string }) => {
  const config = requireConfigured();
  const existing = await latestStripeSubscription(user.id);
  if (!existing?.paymentCustomerId) throw new HttpError(409, "There is no billing account to manage yet.");
  const session = await (await getStripe(config)).billingPortal.sessions.create({
    customer: existing.paymentCustomerId,
    return_url: `${config.returnUrl}/#billing=portal`,
  });
  return { url: session.url };
};

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** Verifies the signature against the raw body; throws 400 on anything that does not check out. */
export const constructWebhookEvent = async (rawBody: Buffer | string, signature: string): Promise<Stripe.Event> => {
  const config = getBillingConfig();
  if (!config.configured) throw new HttpError(503, "Billing is not configured.");
  if (!signature) throw new HttpError(400, "Missing Stripe signature.");
  const stripe = await getStripe(config);
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
  } catch {
    throw new HttpError(400, "Invalid Stripe signature.");
  }
};

const tierKeyForPrice = (config: BillingConfig, priceId: string): string => {
  for (const key of SELF_SERVE_TIER_KEYS) {
    if (config.prices[key] === priceId || config.foundingPrices[key] === priceId) return key;
  }
  return "";
};

const PAYMENT_STATUS: Record<string, string> = {
  active: "paid",
  trialing: "trial",
  past_due: "past_due",
  paused: "paused",
};

/** Stripe states that end paid access. `incomplete` is absent on purpose: it never granted any. */
const ENDED_STATUSES = ["canceled", "unpaid", "incomplete_expired"];

const periodEnd = (subscription: Stripe.Subscription): Date | null => {
  // Moved from the subscription to its items in API version 2025-03-31; read both.
  const seconds = (subscription as any).current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
};

const customerId = (value: string | { id: string } | null | undefined): string | null =>
  !value ? null : typeof value === "string" ? value : value.id;

const userIdForSubscription = async (subscription: Stripe.Subscription, hint?: string | null): Promise<string> => {
  if (hint) return hint;
  if (subscription.metadata?.userId) return subscription.metadata.userId;
  const row = await db.userSubscription.findFirst({
    where: { paymentProvider: "stripe", paymentSubscriptionId: subscription.id },
    select: { userId: true },
  });
  return row?.userId || "";
};

/**
 * Downgrade or cancellation: the account moves to Free and keeps everything.
 *
 * This writes subscription rows and the user's plan columns and nothing else.
 * Animals over the Free cap are not touched -- they stay on the device and stay
 * readable in the cloud; the cap only stops *new* animals from being added to
 * the cloud copy (see assertAnimalCapacity in breederDataService.ts).
 */
export const degradeToFree = async (userId: string, stripeSubscriptionId: string, note: string) => {
  const now = new Date();
  await db.$transaction(async (tx: any) => {
    await tx.userSubscription.updateMany({
      where: { userId, paymentProvider: "stripe", paymentSubscriptionId: stripeSubscriptionId, status: { not: "cancelled" } },
      data: { status: "cancelled", paymentStatus: "cancelled", cancelledAt: now, renewsAt: null },
    });
    const stillLive = await tx.userSubscription.findFirst({
      where: { userId, status: { in: LIVE_STATUSES } },
    });
    if (stillLive) return;
    const free = await tx.subscriptionTier.findFirst({
      where: { key: DEFAULT_TIER_KEY, isActive: true, archivedAt: null },
    });
    if (free) {
      await tx.userSubscription.create({
        data: {
          userId,
          tierId: free.id,
          status: "active",
          paymentStatus: "none",
          paymentProvider: "default",
          internalNote: `${note} Moved to Free; no records were removed.`,
        },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionPlan: free?.key || DEFAULT_TIER_KEY,
        subscriptionStatus: free ? "active" : "inactive",
        subscriptionPaymentStatus: "none",
        subscriptionRenewalAt: null,
        subscriptionTrialEndsAt: null,
      },
    });
  });
};

/** Mirrors one Stripe subscription onto UserSubscription. Writes absolute state, so replays are harmless. */
export const applyStripeSubscription = async (subscription: Stripe.Subscription, userIdHint?: string | null) => {
  const userId = await userIdForSubscription(subscription, userIdHint);
  if (!userId) {
    console.warn("[billing] subscription has no known user; ignoring", { subscription: subscription.id });
    return { applied: false, reason: "unknown_user" };
  }

  if (ENDED_STATUSES.includes(subscription.status)) {
    await degradeToFree(userId, subscription.id, `Stripe subscription ${subscription.status}.`);
    return { applied: true, userId, tierKey: DEFAULT_TIER_KEY };
  }
  if (subscription.status === "incomplete") {
    // First payment not taken yet: nothing was bought, so nothing changes.
    return { applied: false, reason: "incomplete" };
  }

  const config = getBillingConfig();
  const priceId = subscription.items?.data?.[0]?.price?.id || "";
  const tierKey = tierKeyForPrice(config, priceId) || String(subscription.metadata?.tierKey || "");
  const tier = tierKey
    ? await db.subscriptionTier.findFirst({ where: { key: tierKey, archivedAt: null } })
    : null;
  if (!tier) {
    console.error("[billing] no tier for Stripe price; subscription not applied", { subscription: subscription.id, priceId });
    return { applied: false, reason: "unknown_price" };
  }

  const status = subscription.status === "paused" ? "paused" : subscription.status;
  const paymentStatus = PAYMENT_STATUS[subscription.status] || subscription.status;
  const renewsAt = subscription.cancel_at_period_end ? null : periodEnd(subscription);
  const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const data = {
    tierId: tier.id,
    status,
    paymentStatus,
    renewsAt,
    trialEndsAt,
    paymentProvider: "stripe",
    paymentCustomerId: customerId(subscription.customer),
    paymentSubscriptionId: subscription.id,
    cancelledAt: null,
    internalNote: subscription.cancel_at_period_end
      ? `Stripe: cancels at period end (${periodEnd(subscription)?.toISOString() || "unknown"}).`
      : "Stripe subscription.",
  };

  const now = new Date();
  await db.$transaction(async (tx: any) => {
    const existing = await tx.userSubscription.findFirst({
      where: { userId, paymentProvider: "stripe", paymentSubscriptionId: subscription.id },
    });
    if (existing) {
      await tx.userSubscription.update({ where: { id: existing.id }, data });
    } else {
      // The Free (or admin-assigned) row this replaces is closed, not deleted, so the history stays.
      await tx.userSubscription.updateMany({
        where: { userId, status: { in: LIVE_STATUSES } },
        data: { status: "cancelled", cancelledAt: now },
      });
      await tx.userSubscription.create({ data: { userId, ...data, startedAt: now } });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionPlan: tier.key,
        subscriptionStatus: status,
        subscriptionPaymentStatus: paymentStatus,
        subscriptionRenewalAt: renewsAt,
        subscriptionTrialEndsAt: trialEndsAt,
        ...(existing ? {} : { subscriptionStartedAt: now }),
      },
    });
  });
  return { applied: true, userId, tierKey: tier.key };
};

export const handleStripeEvent = async (event: Stripe.Event) => {
  const config = getBillingConfig();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) return { handled: false };
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      // Read the subscription fresh rather than trusting the session: it carries the price and period.
      const subscription = await (await getStripe(config)).subscriptions.retrieve(subscriptionId);
      const userId = session.client_reference_id || session.metadata?.userId || null;
      return { handled: true, ...(await applyStripeSubscription(subscription, userId)) };
    }
    case "customer.subscription.updated":
      return { handled: true, ...(await applyStripeSubscription(event.data.object as Stripe.Subscription)) };
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await userIdForSubscription(subscription);
      if (!userId) return { handled: false };
      await degradeToFree(userId, subscription.id, "Stripe subscription cancelled.");
      return { handled: true, userId, tierKey: DEFAULT_TIER_KEY };
    }
    default:
      return { handled: false };
  }
};

/** Logged once at boot so a deploy shows whether it can sell anything. */
export const describeBillingConfig = (): string => {
  const config = getBillingConfig();
  if (!config.configured) return `[billing] off: ${config.reason} Plans are not purchasable.`;
  return `[billing] ${config.mode} mode; purchasable: ${Object.keys(config.prices).join(", ")}`;
};
