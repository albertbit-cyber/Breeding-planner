import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  shedTestOrderResult: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  shedTestOrder: { update: vi.fn() },
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestOrder: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: any) => callback(tx)),
  },
}));

vi.mock("../services/orderNumberService", () => ({
  ensureSharedOrderNumbers: vi.fn(async () => undefined),
}));

vi.mock("../services/labGeneticsService", () => ({
  applyConfirmedResultGenetics: vi.fn(async () => []),
}));

vi.mock("../services/labOrderNotificationService", () => ({
  notifyResultsReady: vi.fn(async () => undefined),
}));

import { prisma } from "../lib/prisma";
import { applyConfirmedResultGenetics } from "../services/labGeneticsService";
import { notifyResultsReady } from "../services/labOrderNotificationService";
import { saveOrderResult } from "../services/orderResultService";

const db = prisma as any;

const LAB_USER = { id: "lab-user-1", role: "lab_staff" as const };
const ORG = { organizationId: "org-lab" };

const orderRow = (over: Record<string, unknown> = {}) => ({
  id: "order-1",
  status: "received",
  breederId: "breeder-1",
  labOrganizationId: "org-lab",
  animals: [
    {
      animalId: "snake-1",
      animalName: "Jasmine",
      tests: [{ offeringId: "off-1", testNameSnapshot: "Pied", testId: null }],
    },
  ],
  results: [],
  ...over,
});

const payload = {
  testCode: "SHED-1",
  animalResults: [
    { animalId: "snake-1", items: [{ orderedTestKey: "order-1:snake-1:1", resultStatus: "visual" }] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.shedTestOrder.findUnique.mockResolvedValue(orderRow());
  tx.shedTestOrderResult.findFirst.mockResolvedValue(null);
  tx.shedTestOrderResult.create.mockImplementation(async ({ data }: any) => ({ id: "result-1", ...data }));
  tx.shedTestOrder.update.mockResolvedValue({});
});

describe("saveOrderResult", () => {
  it("writes the animal's genetics in the same transaction as the result", async () => {
    await saveOrderResult("order-1", payload, LAB_USER, "submit", ORG);

    expect(applyConfirmedResultGenetics).toHaveBeenCalledTimes(1);
    const [handle, args] = vi.mocked(applyConfirmedResultGenetics).mock.calls[0];
    // The transaction handle, not the top-level client: the finding and its
    // consequence for the animal land together or not at all.
    expect(handle).toBe(tx);
    expect(args.order.id).toBe("order-1");
    expect(args.results[0]).toMatchObject({ id: "result-1", animalId: "snake-1" });
  });

  it("tells the breeder their results are ready", async () => {
    await saveOrderResult("order-1", payload, LAB_USER, "submit", ORG);

    expect(notifyResultsReady).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyResultsReady).mock.calls[0][0].results[0]).toMatchObject({ id: "result-1" });
  });

  it("leaves the animal and the breeder alone while a draft is still being worked on", async () => {
    await saveOrderResult("order-1", payload, LAB_USER, "draft", ORG);

    expect(applyConfirmedResultGenetics).not.toHaveBeenCalled();
    expect(notifyResultsReady).not.toHaveBeenCalled();
  });

  it("rolls the result back when the genetics update fails", async () => {
    vi.mocked(applyConfirmedResultGenetics).mockRejectedValueOnce(new Error("animal write failed"));

    await expect(saveOrderResult("order-1", payload, LAB_USER, "submit", ORG)).rejects.toThrow(
      "animal write failed"
    );
    // Nothing was announced, because as far as the database is concerned nothing happened.
    expect(notifyResultsReady).not.toHaveBeenCalled();
  });

  it("refuses to touch an order belonging to another laboratory", async () => {
    db.shedTestOrder.findUnique.mockResolvedValue(orderRow({ labOrganizationId: "org-someone-else" }));

    await expect(saveOrderResult("order-1", payload, LAB_USER, "submit", ORG)).rejects.toThrow(
      "Order not found."
    );
    expect(applyConfirmedResultGenetics).not.toHaveBeenCalled();
  });
});
