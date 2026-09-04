import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));

vi.mock("../services/notificationService", () => ({
  createNotification: vi.fn(),
}));

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import { createNotification } from "../services/notificationService";
import { enqueueEmail } from "../email/queueService";
import {
  notifyLabApplicationReceived,
  notifyOrderStatusChanged,
  notifyPaymentInvoiced,
  notifyResultsReady,
} from "../services/labOrderNotificationService";

const db = prisma as any;

const ORDER = {
  id: "order-1",
  orderNumber: "SO-2026-0007",
  breederId: "breeder-1",
  labOrganizationId: "org-lab",
  totalPrice: 145.5,
  currency: "EUR",
  paymentRef: "INV-99",
  animals: [
    { animalId: "snake-1", animalName: "Jasmine" },
    { animalId: "snake-2", animalName: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: "breeder-1", email: "keeper@example.com", fullName: "Sam Keeper" });
  db.organization.findUnique.mockResolvedValue({ name: "ProHerper BV", labAccount: { labName: "ProHerper" } });
});

describe("notifyOrderStatusChanged", () => {
  it("tells the breeder their samples arrived, in the app and by email", async () => {
    await notifyOrderStatusChanged({ order: ORDER, previousStatus: "submitted", nextStatus: "received" });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "breeder-1", type: "lab_order_received" })
    );
    const email = vi.mocked(enqueueEmail).mock.calls[0][0];
    expect(email).toMatchObject({
      recipientEmail: "keeper@example.com",
      category: "lab_orders",
      idempotencyKey: "lab_order_status:order-1:received",
    });
    // Named by the laboratory's trading name, which is what the breeder ordered from.
    expect(email.templatePayload).toMatchObject({ labName: "ProHerper", animalCount: 2 });
  });

  it("says nothing when the status did not actually change", async () => {
    await notifyOrderStatusChanged({ order: ORDER, previousStatus: "received", nextStatus: "received" });
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("leaves completion to the results mail, which carries the findings", async () => {
    await notifyOrderStatusChanged({ order: ORDER, previousStatus: "in_progress", nextStatus: "completed" });
    expect(createNotification).not.toHaveBeenCalled();
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it("never lets a notification failure reach the caller", async () => {
    vi.mocked(createNotification).mockRejectedValueOnce(new Error("notification table is down"));
    await expect(
      notifyOrderStatusChanged({ order: ORDER, previousStatus: "submitted", nextStatus: "received" })
    ).resolves.toBeUndefined();
  });
});

describe("notifyResultsReady", () => {
  it("names what was found rather than only that something was", async () => {
    await notifyResultsReady({
      order: ORDER,
      results: [
        {
          id: "res-1",
          animalId: "snake-1",
          findingsJson: [
            { marker: "Piebald", outcome: "positive" },
            { marker: "Clown", outcome: "notDetected" },
          ],
        },
      ],
    });

    const email = vi.mocked(enqueueEmail).mock.calls[0][0];
    expect(email.templatePayload).toMatchObject({
      findingLines: ["Jasmine — Piebald: visual, Clown: not detected"],
    });
  });

  it("falls back to the animal id when the keeper never named it", async () => {
    await notifyResultsReady({
      order: ORDER,
      results: [{ id: "res-2", animalId: "snake-2", findingsJson: [{ marker: "Albino", outcome: "carrierDetected" }] }],
    });
    const email = vi.mocked(enqueueEmail).mock.calls[0][0];
    expect(email.templatePayload).toMatchObject({ findingLines: ["snake-2 — Albino: het"] });
  });

  it("sends again when a laboratory corrects a result, because that is new news", async () => {
    await notifyResultsReady({
      order: ORDER,
      results: [{ id: "res-1", animalId: "snake-1", findingsJson: [{ marker: "Albino", outcome: "positive" }] }],
    });
    await notifyResultsReady({
      order: ORDER,
      results: [{ id: "res-2", animalId: "snake-1", findingsJson: [{ marker: "Albino", outcome: "notDetected" }] }],
    });

    const keys = vi.mocked(enqueueEmail).mock.calls.map((call) => call[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("does nothing at all for an empty result set", async () => {
    await notifyResultsReady({ order: ORDER, results: [] });
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe("notifyPaymentInvoiced", () => {
  it("tells the breeder an invoice exists, with the amount", async () => {
    await notifyPaymentInvoiced({ order: ORDER, previousPaymentStatus: "pending", nextPaymentStatus: "invoiced" });

    const email = vi.mocked(enqueueEmail).mock.calls[0][0];
    expect(email.templatePayload).toMatchObject({ amountDisplay: "€145.50", paymentRef: "INV-99" });
    expect(email.idempotencyKey).toBe("lab_order_invoiced:order-1");
  });

  it("stays quiet for every other payment transition", async () => {
    await notifyPaymentInvoiced({ order: ORDER, previousPaymentStatus: "invoiced", nextPaymentStatus: "paid" });
    await notifyPaymentInvoiced({ order: ORDER, previousPaymentStatus: "invoiced", nextPaymentStatus: "invoiced" });
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe("notifyLabApplicationReceived", () => {
  const APPLICATION = {
    id: "app-1",
    labName: "Nordic Reptile Genetics",
    contactPerson: "Ingrid Vos",
    email: "hello@nordic.example",
    location: "Norway",
    reason: "We already test for local keepers.",
  };

  it("reaches every administrator, so an application cannot sit unseen", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "admin-1", email: "one@example.com", fullName: "One" },
      { id: "admin-2", email: "two@example.com", fullName: "Two" },
    ]);

    await notifyLabApplicationReceived(APPLICATION);

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(vi.mocked(enqueueEmail).mock.calls.map((call) => call[0].recipientEmail)).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
    // Keyed per admin, so one administrator reading it does not suppress the other's copy.
    expect(vi.mocked(enqueueEmail).mock.calls.map((call) => call[0].idempotencyKey)).toEqual([
      "lab_application:app-1:admin-1",
      "lab_application:app-1:admin-2",
    ]);
  });

  it("warns rather than throwing when there is no administrator to tell", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.user.findMany.mockResolvedValue([]);

    await expect(notifyLabApplicationReceived(APPLICATION)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no admin to notify"));
    warn.mockRestore();
  });
});
