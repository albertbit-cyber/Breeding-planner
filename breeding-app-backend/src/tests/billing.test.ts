import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * Payments in Stripe test mode.
 *
 * Stripe itself is mocked except for its webhook signing, which is the real
 * implementation: a test that signs a payload with a made-up helper would prove
 * only that the helper agrees with itself.
 */

const stripeMock = vi.hoisted(() => ({
  prices: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  billingPortal: { sessions: { create: vi.fn() } },
  subscriptions: { retrieve: vi.fn() },
  webhooks: null as any,
}));

vi.mock("stripe", async (importOriginal) => {
  const actual: any = await importOriginal();
  const RealStripe = actual.default ?? actual;
  stripeMock.webhooks = new RealStripe("sk_test_signing_only").webhooks;
  class FakeStripe {
    prices = stripeMock.prices;
    checkout = stripeMock.checkout;
    billingPortal = stripeMock.billingPortal;
    subscriptions = stripeMock.subscriptions;
    webhooks = stripeMock.webhooks;
  }
  return { default: FakeStripe };
});

vi.mock("../lib/prisma", () => {
  const db: any = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    foundingMember: { findUnique: vi.fn() },
    subscriptionTier: { findFirst: vi.fn(), count: vi.fn() },
    userSubscription: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    userFeatureOverride: { findFirst: vi.fn() },
    usageTracking: { findUnique: vi.fn(), create: vi.fn() },
    // Every destructive method is present so a call to one would be caught, not crash.
    animal: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    pairing: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    clutch: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    breederPlannerState: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    breedingCycle: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn(), update: vi.fn() },
    follicleExamination: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn(), update: vi.fn() },
  };
  db.$transaction = vi.fn(async (callback: any) => callback(db));
  return { prisma: db };
});

import { app } from "../app";
import { prisma } from "../lib/prisma";
import {
  createCheckoutSession,
  createPortalSession,
  getBillingConfig,
  getBillingStatus,
  handleStripeEvent,
} from "../services/billingService";
import { canAccessFeature, changeOwnSubscription } from "../services/subscriptionService";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";

const db = prisma as any;

const WEBHOOK_SECRET = "whsec_test_secret";
const PRICES = {
  STRIPE_PRICE_HOBBY: "price_hobby",
  STRIPE_PRICE_HOBBY_PLUS: "price_hobby_plus",
  STRIPE_PRICE_BREEDER: "price_breeder",
  STRIPE_PRICE_PROFESSIONAL_BREEDER: "price_pro",
};
const BILLING_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_ALLOW_LIVE",
  "STRIPE_FOUNDING_COUPON",
  "BILLING_RETURN_URL",
  ...Object.keys(PRICES),
  ...Object.keys(PRICES).map((key) => key.replace("STRIPE_PRICE_", "STRIPE_FOUNDING_PRICE_")),
];

const configure = (extra: Record<string, string> = {}) => {
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    BILLING_RETURN_URL: "https://app.example.test/",
    ...PRICES,
    ...extra,
  });
};

const tiers: Record<string, any> = {
  free: { id: "tier-free", key: "free", name: "Free", monthlyPrice: 0, customPrice: false },
  hobby: { id: "tier-hobby", key: "hobby", name: "Hobby", monthlyPrice: 9, customPrice: false },
  breeder: { id: "tier-breeder", key: "breeder", name: "Breeder", monthlyPrice: 29, customPrice: false },
};
const breeder = { id: "user-1", email: "keeper@example.test", role: "breeder" };

const stripeSubscription = (overrides: Record<string, any> = {}) => ({
  id: "sub_1",
  object: "subscription",
  status: "active",
  customer: "cus_1",
  cancel_at_period_end: false,
  trial_end: null,
  metadata: { userId: "user-1", tierKey: "breeder" },
  items: { data: [{ price: { id: "price_breeder" }, current_period_end: 1_800_000_000 }] },
  ...overrides,
});

const signedWebhook = (event: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
  const payload = JSON.stringify({ id: "evt_1", object: "event", ...event });
  const signature = stripeMock.webhooks.generateTestHeaderString({ payload, secret });
  return request(app)
    .post("/api/billing/webhook")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of BILLING_ENV_KEYS) delete process.env[key];
  db.user.findUnique.mockResolvedValue({ id: "user-1", email: "keeper@example.test" });
  db.user.update.mockResolvedValue({});
  db.foundingMember.findUnique.mockResolvedValue(null);
  db.subscriptionTier.findFirst.mockImplementation(async ({ where }: any) => tiers[where?.key] || null);
  db.subscriptionTier.count.mockResolvedValue(7);
  db.userSubscription.findFirst.mockResolvedValue(null);
  db.userSubscription.create.mockResolvedValue({ id: "row-new" });
  db.userSubscription.update.mockResolvedValue({});
  db.userSubscription.updateMany.mockResolvedValue({ count: 1 });
  db.userFeatureOverride.findFirst.mockResolvedValue(null);
  stripeMock.prices.retrieve.mockResolvedValue({ id: "price_breeder", currency: "eur", recurring: { interval: "month" } });
  stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
  stripeMock.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.test/p_1" });
  stripeMock.subscriptions.retrieve.mockResolvedValue(stripeSubscription());
});

// The service loads the SDK lazily; loading it here runs the mock factory, which captures the real signer.
beforeAll(async () => {
  await import("stripe");
});

afterEach(() => {
  for (const key of BILLING_ENV_KEYS) delete process.env[key];
});

describe("billing with no Stripe keys", () => {
  it("reports plans as not purchasable and refuses checkout", async () => {
    const status = await getBillingStatus(breeder);
    expect(status).toMatchObject({ configured: false, mode: "off", message: "Plans are not purchasable yet.", purchasableTierKeys: [] });

    await expect(createCheckoutSession(breeder, { tierKey: "breeder" })).rejects.toMatchObject({
      statusCode: 503,
      message: "Plans are not purchasable yet.",
    });
    await expect(createPortalSession(breeder)).rejects.toMatchObject({ statusCode: 503 });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses a webhook it cannot verify without touching the database", async () => {
    const response = await signedWebhook({ type: "customer.subscription.deleted", data: { object: stripeSubscription() } });

    expect(response.status).toBe(503);
    expect(db.userSubscription.updateMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("stays off with a live key unless live mode is explicitly allowed", () => {
    configure({ STRIPE_SECRET_KEY: "sk_live_123" });
    expect(getBillingConfig()).toMatchObject({ configured: false, mode: "off" });

    configure({ STRIPE_SECRET_KEY: "sk_live_123", STRIPE_ALLOW_LIVE: "true" });
    expect(getBillingConfig()).toMatchObject({ configured: true, mode: "live" });
  });

  it("is configured in test mode with a test key, webhook secret and prices", () => {
    configure();
    expect(getBillingConfig()).toMatchObject({ configured: true, mode: "test" });
  });
});

describe("checkout session", () => {
  beforeEach(() => configure());

  it("is created with the tier's monthly price and the account's identity", async () => {
    const result = await createCheckoutSession(breeder, { tierKey: "breeder" });

    expect(result).toEqual({ url: "https://checkout.stripe.test/cs_1", mode: "test", founding: false });
    expect(stripeMock.prices.retrieve).toHaveBeenCalledWith("price_breeder");
    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_breeder", quantity: 1 }],
      customer_email: "keeper@example.test",
      client_reference_id: "user-1",
      metadata: { userId: "user-1", tierKey: "breeder", founding: "false" },
      subscription_data: { metadata: { userId: "user-1", tierKey: "breeder", founding: "false" } },
      success_url: "https://app.example.test/#billing=success",
      cancel_url: "https://app.example.test/#billing=cancelled",
    });
    expect(params.discounts).toBeUndefined();
  });

  it("reuses the Stripe customer of an ended subscription instead of making a second one", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ status: "cancelled", paymentCustomerId: "cus_old" });

    await createCheckoutSession(breeder, { tierKey: "hobby" });

    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.customer).toBe("cus_old");
    expect(params.customer_email).toBeUndefined();
    expect(params.line_items[0].price).toBe("price_hobby");
  });

  it("charges a founding member the founding price when one is mapped", async () => {
    configure({ STRIPE_FOUNDING_PRICE_BREEDER: "price_breeder_founding", STRIPE_FOUNDING_COUPON: "founding" });
    db.foundingMember.findUnique.mockResolvedValue({ email: "keeper@example.test" });

    const result = await createCheckoutSession(breeder, { tierKey: "breeder" });

    expect(db.foundingMember.findUnique).toHaveBeenCalledWith({ where: { email: "keeper@example.test" } });
    expect(result.founding).toBe(true);
    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_breeder_founding");
    expect(params.discounts).toBeUndefined();
  });

  it("applies the founding coupon to the regular price when no founding price is mapped", async () => {
    configure({ STRIPE_FOUNDING_COUPON: "founding" });
    db.foundingMember.findUnique.mockResolvedValue({ email: "keeper@example.test" });

    await createCheckoutSession(breeder, { tierKey: "breeder" });

    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_breeder");
    expect(params.discounts).toEqual([{ coupon: "founding" }]);
  });

  it("gives an account that is not on the waitlist no founding discount", async () => {
    configure({ STRIPE_FOUNDING_PRICE_BREEDER: "price_breeder_founding", STRIPE_FOUNDING_COUPON: "founding" });

    await createCheckoutSession(breeder, { tierKey: "breeder" });

    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price).toBe("price_breeder");
    expect(params.discounts).toBeUndefined();
  });

  it("refuses a price that is not monthly in euros", async () => {
    stripeMock.prices.retrieve.mockResolvedValue({ id: "price_breeder", currency: "usd", recurring: { interval: "month" } });
    await expect(createCheckoutSession(breeder, { tierKey: "breeder" })).rejects.toMatchObject({ statusCode: 503 });

    stripeMock.prices.retrieve.mockResolvedValue({ id: "price_breeder", currency: "eur", recurring: { interval: "year" } });
    await expect(createCheckoutSession(breeder, { tierKey: "breeder" })).rejects.toMatchObject({ statusCode: 503 });
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("only sells the four self-serve tiers", async () => {
    for (const tierKey of ["free", "lab_partner", "enterprise", ""]) {
      await expect(createCheckoutSession(breeder, { tierKey })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it("refuses a second checkout while a paid subscription is live, so nobody is billed twice", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ status: "active", paymentCustomerId: "cus_1" });

    await expect(createCheckoutSession(breeder, { tierKey: "hobby" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("opens the customer portal for an account with a Stripe customer", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ status: "active", paymentCustomerId: "cus_1" });

    const result = await createPortalSession(breeder);

    expect(result.url).toBe("https://billing.stripe.test/p_1");
    expect(stripeMock.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example.test/#billing=portal",
    });
  });
});

describe("webhook", () => {
  beforeEach(() => configure());

  it("rejects a payload whose signature does not verify, and writes nothing", async () => {
    const response = await signedWebhook(
      { type: "customer.subscription.deleted", data: { object: stripeSubscription() } },
      "whsec_someone_else",
    );

    expect(response.status).toBe(400);
    expect(db.userSubscription.updateMany).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature at all", async () => {
    const response = await request(app)
      .post("/api/billing/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "customer.subscription.deleted" }));

    expect(response.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("checkout.session.completed: moves the account onto the paid tier and closes the Free row", async () => {
    const response = await signedWebhook({
      type: "checkout.session.completed",
      data: { object: { object: "checkout.session", mode: "subscription", subscription: "sub_1", client_reference_id: "user-1", metadata: {} } },
    });

    expect(response.status).toBe(200);
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    expect(db.userSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", status: { in: ["active", "trialing", "paused", "past_due"] } },
      data: expect.objectContaining({ status: "cancelled" }),
    });
    expect(db.userSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        tierId: "tier-breeder",
        status: "active",
        paymentStatus: "paid",
        paymentProvider: "stripe",
        paymentCustomerId: "cus_1",
        paymentSubscriptionId: "sub_1",
        renewsAt: new Date(1_800_000_000 * 1000),
      }),
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ subscriptionPlan: "breeder", subscriptionStatus: "active", subscriptionPaymentStatus: "paid" }),
    });
  });

  it("checkout.session.completed is idempotent: a replay updates the same row", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ id: "row-stripe", userId: "user-1" });

    await handleStripeEvent({
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: "user-1" } },
    } as any);

    expect(db.userSubscription.create).not.toHaveBeenCalled();
    expect(db.userSubscription.update).toHaveBeenCalledWith({
      where: { id: "row-stripe" },
      data: expect.objectContaining({ tierId: "tier-breeder", paymentSubscriptionId: "sub_1" }),
    });
  });

  it("checkout.session.completed with the first payment still pending grants nothing", async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(stripeSubscription({ status: "incomplete" }));

    await handleStripeEvent({
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", subscription: "sub_1", client_reference_id: "user-1" } },
    } as any);

    expect(db.userSubscription.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated: a plan switch in the portal moves the tier, by price id", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ id: "row-stripe", userId: "user-1" });

    const response = await signedWebhook({
      type: "customer.subscription.updated",
      data: { object: stripeSubscription({ metadata: { userId: "user-1", tierKey: "breeder" }, items: { data: [{ price: { id: "price_hobby" }, current_period_end: 1_800_000_000 }] } }) },
    });

    expect(response.status).toBe(200);
    expect(db.userSubscription.update).toHaveBeenCalledWith({
      where: { id: "row-stripe" },
      data: expect.objectContaining({ tierId: "tier-hobby", status: "active" }),
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ subscriptionPlan: "hobby" }),
    });
  });

  it("customer.subscription.updated: a founding price maps back to its tier", async () => {
    configure({ STRIPE_FOUNDING_PRICE_BREEDER: "price_breeder_founding" });
    db.userSubscription.findFirst.mockResolvedValue({ id: "row-stripe", userId: "user-1" });

    await handleStripeEvent({
      type: "customer.subscription.updated",
      data: { object: stripeSubscription({ metadata: { userId: "user-1" }, items: { data: [{ price: { id: "price_breeder_founding" } }] } }) },
    } as any);

    expect(db.userSubscription.update).toHaveBeenCalledWith({
      where: { id: "row-stripe" },
      data: expect.objectContaining({ tierId: "tier-breeder" }),
    });
  });

  it("customer.subscription.updated: a failed renewal keeps the tier and records past_due", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ id: "row-stripe", userId: "user-1" });

    await handleStripeEvent({ type: "customer.subscription.updated", data: { object: stripeSubscription({ status: "past_due" }) } } as any);

    expect(db.userSubscription.update).toHaveBeenCalledWith({
      where: { id: "row-stripe" },
      data: expect.objectContaining({ tierId: "tier-breeder", status: "past_due", paymentStatus: "past_due" }),
    });
  });

  it("customer.subscription.updated: cancel at period end keeps access and stops showing a renewal", async () => {
    db.userSubscription.findFirst.mockResolvedValue({ id: "row-stripe", userId: "user-1" });

    await handleStripeEvent({ type: "customer.subscription.updated", data: { object: stripeSubscription({ cancel_at_period_end: true }) } } as any);

    expect(db.userSubscription.update).toHaveBeenCalledWith({
      where: { id: "row-stripe" },
      data: expect.objectContaining({ status: "active", renewsAt: null }),
    });
  });

  it("customer.subscription.updated: an unpaid subscription degrades to Free", async () => {
    await handleStripeEvent({ type: "customer.subscription.updated", data: { object: stripeSubscription({ status: "unpaid" }) } } as any);

    expect(db.userSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", tierId: "tier-free", status: "active", paymentProvider: "default" }),
    });
  });

  it("customer.subscription.deleted: closes the Stripe row and puts the account on Free", async () => {
    const response = await signedWebhook({ type: "customer.subscription.deleted", data: { object: stripeSubscription({ status: "canceled" }) } });

    expect(response.status).toBe(200);
    expect(db.userSubscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", paymentProvider: "stripe", paymentSubscriptionId: "sub_1", status: { not: "cancelled" } },
      data: expect.objectContaining({ status: "cancelled", paymentStatus: "cancelled", renewsAt: null }),
    });
    expect(db.userSubscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", tierId: "tier-free", status: "active" }),
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ subscriptionPlan: "free", subscriptionStatus: "active", subscriptionPaymentStatus: "none" }),
    });
  });

  it("customer.subscription.deleted finds the account by subscription id when metadata is missing", async () => {
    db.userSubscription.findFirst.mockImplementation(async ({ where }: any) =>
      where?.paymentSubscriptionId === "sub_1" ? { userId: "user-1" } : null);

    await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: stripeSubscription({ metadata: {} }) } } as any);

    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: expect.objectContaining({ subscriptionPlan: "free" }) });
  });

  it("acknowledges event types it does not handle without writing", async () => {
    const response = await signedWebhook({ type: "invoice.paid", data: { object: { object: "invoice" } } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, handled: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

/**
 * Downgrade and cancellation degrade to Free without data loss.
 *
 * A Breeder account holding 30 animals cancels. Free keeps 20 in the cloud. The
 * ten over the cap are not deleted, hidden or trimmed: the cloud still returns
 * all 30, edits to any of them still save, and only *adding* a 31st is refused
 * -- with a message that says every animal is still on the device.
 */
describe("degrade to Free keeps every animal", () => {
  const thirtyAnimals = Array.from({ length: 30 }, (_, index) => ({
    id: `row-${index + 1}`,
    appAnimalId: `snake-${index + 1}`,
    payload: { id: `snake-${index + 1}`, name: `Snake ${index + 1}` },
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
  }));
  const freeTierWithFeatures = {
    ...tiers.free,
    features: [{ featureKey: "animals.create", enabled: true, limitValue: 20 }],
  };

  const expectNothingDestroyed = () => {
    for (const model of ["animal", "pairing", "clutch"]) {
      expect(db[model].delete).not.toHaveBeenCalled();
      expect(db[model].deleteMany).not.toHaveBeenCalled();
    }
    expect(db.animal.updateMany).not.toHaveBeenCalled();
    for (const call of db.animal.update.mock.calls) {
      expect(call[0].data.deletedAt).toBeUndefined();
    }
  };

  beforeEach(() => {
    configure();
    db.animal.findMany.mockResolvedValue(thirtyAnimals);
    db.animal.count.mockResolvedValue(30);
    db.animal.createMany.mockResolvedValue({ count: 0 });
    db.animal.update.mockResolvedValue({});
    db.pairing.findMany.mockResolvedValue([]);
    db.clutch.findMany.mockResolvedValue([]);
    db.breederPlannerState.findUnique.mockResolvedValue(null);
  });

  it("cancellation writes subscription rows only", async () => {
    await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: stripeSubscription({ status: "canceled" }) } } as any);

    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: expect.objectContaining({ subscriptionPlan: "free" }) });
    expectNothingDestroyed();
  });

  it("after the downgrade, the over-cap animals stay readable and editable, and only additions are refused", async () => {
    await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: stripeSubscription({ status: "canceled" }) } } as any);
    // From here the account resolves to the Free row the downgrade wrote.
    db.userSubscription.findFirst.mockResolvedValue({ status: "active", tier: freeTierWithFeatures });

    const access = await canAccessFeature(breeder, "animals.create");
    expect(access).toMatchObject({ allowed: false, currentUsage: 30, limit: 20 });

    const snapshot = await listBreederSnapshot("user-1");
    expect(snapshot.animals).toHaveLength(30);

    await upsertBreederSnapshot("user-1", {
      animals: [{ id: "snake-27", name: "Renamed over the cap", updatedAt: "2026-02-01T00:00:00.000Z" }],
    });
    expect(db.animal.update).toHaveBeenCalledWith({ where: { id: "row-27" }, data: expect.objectContaining({ name: "Renamed over the cap" }) });

    await expect(
      upsertBreederSnapshot("user-1", { animals: [{ id: "snake-31", name: "New" }] }),
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining("Every animal is still on this device") });

    expectNothingDestroyed();
  });

  it("a downgrade on a deployment with no Free tier still closes the paid row and deletes nothing", async () => {
    db.subscriptionTier.findFirst.mockResolvedValue(null);

    await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: stripeSubscription({ status: "canceled" }) } } as any);

    expect(db.userSubscription.updateMany).toHaveBeenCalled();
    expect(db.userSubscription.create).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: expect.objectContaining({ subscriptionPlan: "free", subscriptionStatus: "inactive" }) });
    expectNothingDestroyed();
  });
});

describe("the empty-catalogue rule survives billing", () => {
  it("an account with no subscription on an unseeded database is still let through, keys or not", async () => {
    db.subscriptionTier.count.mockResolvedValue(0);
    db.subscriptionTier.findFirst.mockResolvedValue(null);

    expect(await canAccessFeature(breeder, "marketplace.create_listing")).toMatchObject({ allowed: true, source: "unconfigured" });

    configure();
    expect(await canAccessFeature(breeder, "marketplace.create_listing")).toMatchObject({ allowed: true, source: "unconfigured" });
  });

  it("a cancelled subscriber on an unseeded database is let through rather than walled off", async () => {
    configure();
    db.subscriptionTier.findFirst.mockResolvedValue(null);
    await handleStripeEvent({ type: "customer.subscription.deleted", data: { object: stripeSubscription({ status: "canceled" }) } } as any);

    db.subscriptionTier.count.mockResolvedValue(0);
    expect(await canAccessFeature(breeder, "animals.create")).toMatchObject({ allowed: true, source: "unconfigured" });
  });
});

describe("self-service plan switch", () => {
  it("cannot hand out a paid tier for nothing", async () => {
    db.subscriptionTier.findFirst.mockResolvedValue({ ...tiers.breeder, isActive: true, isPublic: true });

    await expect(changeOwnSubscription(breeder as any, { tierId: "tier-breeder" })).rejects.toMatchObject({ statusCode: 402 });
    expect(db.userSubscription.create).not.toHaveBeenCalled();
  });

  it("sends a Stripe subscriber to the portal instead of silently dropping to Free", async () => {
    db.subscriptionTier.findFirst.mockResolvedValue({ ...tiers.free, isActive: true, isPublic: true });
    db.userSubscription.findFirst.mockResolvedValue({ id: "row-stripe", status: "active", paymentProvider: "stripe" });

    await expect(changeOwnSubscription(breeder as any, { tierId: "tier-free" })).rejects.toMatchObject({ statusCode: 409 });
    expect(db.userSubscription.create).not.toHaveBeenCalled();
  });
});
