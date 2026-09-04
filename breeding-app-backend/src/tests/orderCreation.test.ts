import { beforeEach, describe, expect, it, vi } from "vitest";

// Records the order in which things happened, so the test can prove the backfill ran before
// the transaction opened rather than inside it.
const events: string[] = [];

vi.mock("../lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    labAccount: { findFirst: vi.fn() },
    labTestOffering: { findMany: vi.fn() },
    pricingConfig: { findUnique: vi.fn() },
    shedTestOrder: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    shedTestOrderAnimal: { createManyAndReturn: vi.fn() },
    shedTestOrderAnimalTest: { createMany: vi.fn() },
  },
}));

vi.mock("../services/orderNumberService", async () => {
  const actual = await vi.importActual<typeof import("../services/orderNumberService")>(
    "../services/orderNumberService"
  );
  return {
    ...actual,
    ensureSharedOrderNumbers: vi.fn(async (...args: unknown[]) => {
      events.push(args.length ? "backfill(with-client)" : "backfill");
    }),
  };
});

// Only the breakdown is faked. splitAnimalTestPrices stays real, so the price assertions below
// exercise the arithmetic the invoice actually uses.
vi.mock("../services/pricingService", async () => {
  const actual = await vi.importActual<typeof import("../services/pricingService")>(
    "../services/pricingService"
  );
  return {
    ...actual,
    calculateOrderBreakdown: vi.fn(),
    toPublicBreakdown: vi.fn(() => ({})),
  };
});

import { prisma } from "../lib/prisma";
import { calculateOrderBreakdown } from "../services/pricingService";
import { ensureSharedOrderNumbers } from "../services/orderNumberService";
import { createOrder } from "../services/orderService";

const db = prisma as any;

// Two animals: the first with two morph tests and a sex test, the second with one morph test.
// Enough to catch a price split that silently changed shape when the loop became a batch.
const breakdown = {
  animalCount: 2,
  tier: "tier_1_9",
  currency: "EUR",
  total: 180,
  perAnimal: [
    {
      animalId: "a-1",
      animalName: "Kaa",
      morphBaseCost: 60,
      additionalMorphCost: 30,
      sexCost: 20,
      panelCost: 0,
      total: 110,
      selectedCatalogTests: [
        { id: "t-morph-1", name: "Clown", pricingType: "morph" },
        { id: "t-morph-2", name: "Piebald", pricingType: "morph" },
        { id: "t-sex", name: "Sexing", pricingType: "sex" },
      ],
    },
    {
      animalId: "a-2",
      animalName: "Nagini",
      morphBaseCost: 60,
      additionalMorphCost: 0,
      sexCost: 0,
      panelCost: 0,
      total: 70,
      selectedCatalogTests: [{ id: "t-morph-3", name: "Albino", pricingType: "morph" }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;

  vi.mocked(calculateOrderBreakdown).mockReturnValue(breakdown as any);

  db.labAccount.findFirst.mockResolvedValue({ labName: "Test Lab" });
  db.labTestOffering.findMany.mockResolvedValue([{ id: "t-morph-1", name: "Clown" }]);
  db.pricingConfig.findUnique.mockResolvedValue({ id: "pricing-1" });

  db.$transaction.mockImplementation(async (fn: any, options: unknown) => {
    events.push(`transaction(${options ? "with-options" : "no-options"})`);
    return fn(db);
  });
  db.shedTestOrder.findMany.mockResolvedValue([{ orderNumber: "09AA00007" }]);
  // totalAnimals/totalPrice are read by the log line that follows the transaction.
  db.shedTestOrder.create.mockResolvedValue({ id: "order-1", totalAnimals: 2, totalPrice: "180" });
  db.shedTestOrder.findUnique.mockResolvedValue({ id: "order-1", breederId: "breeder-1" });
  db.shedTestOrderAnimal.createManyAndReturn.mockImplementation(async ({ data }: any) =>
    data.map((row: any, index: number) => ({ id: `oa-${index + 1}`, animalId: row.animalId }))
  );
  db.shedTestOrderAnimalTest.createMany.mockResolvedValue({ count: 4 });
});

describe("createOrder", () => {
  it("backfills order numbers before opening the transaction, not inside it", async () => {
    await createOrder("breeder-1", [], "lab-1");

    // Inside the transaction, a rollback undid the backfill, so the next attempt redid the
    // same work and timed out at the same point. Retrying could never clear it.
    expect(events[0]).toBe("backfill");
    expect(events).toContain("transaction(with-options)");
    expect(events.indexOf("backfill")).toBeLessThan(events.indexOf("transaction(with-options)"));
  });

  it("never hands the backfill a transaction client", async () => {
    await createOrder("breeder-1", [], "lab-1");
    expect(events).not.toContain("backfill(with-client)");
    for (const call of vi.mocked(ensureSharedOrderNumbers).mock.calls) {
      expect(call).toHaveLength(0);
    }
  });

  it("states a transaction timeout instead of taking Prisma's 5 second default", async () => {
    await createOrder("breeder-1", [], "lab-1");
    const [, options] = db.$transaction.mock.calls[0];
    expect(options).toBeTruthy();
    expect(options.timeout).toBeGreaterThan(5_000);
  });

  it("retries when two orders to one laboratory claim the same number", async () => {
    const conflict = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["lab_organization_id", "orderNumber"] },
    });
    let attempts = 0;
    db.$transaction.mockImplementation(async (fn: any) => {
      attempts += 1;
      // The first attempt loses the race; the second reads the number again and
      // sees the winner's row.
      if (attempts === 1) throw conflict;
      return fn(db);
    });

    const order = await createOrder("breeder-1", [], "lab-1");

    expect(attempts).toBe(2);
    expect(order).toBeTruthy();
  });

  it("gives up rather than looping forever on a number it can never take", async () => {
    const conflict = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["lab_organization_id", "orderNumber"] },
    });
    db.$transaction.mockRejectedValue(conflict);

    await expect(createOrder("breeder-1", [], "lab-1")).rejects.toThrow("Unique constraint failed");
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry a failure that has nothing to do with the order number", async () => {
    db.$transaction.mockRejectedValue(
      Object.assign(new Error("duplicate breeder"), { code: "P2002", meta: { target: ["breederId"] } })
    );

    await expect(createOrder("breeder-1", [], "lab-1")).rejects.toThrow("duplicate breeder");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("asks only for this lab's highest order number this month", async () => {
    await createOrder("breeder-1", [], "lab-1");

    const [args] = db.shedTestOrder.findMany.mock.calls[0];
    // Reading every order the lab ever received made placing an order cost more the longer
    // the lab had been trading.
    expect(args.take).toBe(1);
    expect(args.orderBy).toEqual({ orderNumber: "desc" });
    expect(args.where.labOrganizationId).toBe("lab-1");
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    expect(args.where.orderNumber.startsWith).toBe(month);
  });

  it("writes every animal in one call and every test line in one more", async () => {
    await createOrder("breeder-1", [], "lab-1");

    expect(db.shedTestOrderAnimal.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(db.shedTestOrderAnimalTest.createMany).toHaveBeenCalledTimes(1);

    const [animalArgs] = db.shedTestOrderAnimal.createManyAndReturn.mock.calls[0];
    expect(animalArgs.data.map((row: any) => row.animalId)).toEqual(["a-1", "a-2"]);
  });

  it("keeps the per-test price split the loop produced", async () => {
    await createOrder("breeder-1", [], "lab-1");

    const [testArgs] = db.shedTestOrderAnimalTest.createMany.mock.calls[0];
    expect(testArgs.data).toEqual([
      // First morph on the animal carries the base cost; the second splits the remainder.
      { orderAnimalId: "oa-1", offeringId: "t-morph-1", testNameSnapshot: "Clown", pricingTypeSnapshot: "morph", priceApplied: 60 },
      { orderAnimalId: "oa-1", offeringId: "t-morph-2", testNameSnapshot: "Piebald", pricingTypeSnapshot: "morph", priceApplied: 30 },
      { orderAnimalId: "oa-1", offeringId: "t-sex", testNameSnapshot: "Sexing", pricingTypeSnapshot: "sex", priceApplied: 20 },
      { orderAnimalId: "oa-2", offeringId: "t-morph-3", testNameSnapshot: "Albino", pricingTypeSnapshot: "morph", priceApplied: 60 },
    ]);
  });

  it("pairs test lines to the right animal row by position", async () => {
    // The same animal can legitimately appear twice on one order, so the rows cannot be
    // matched back by animalId.
    vi.mocked(calculateOrderBreakdown).mockReturnValue({
      ...breakdown,
      perAnimal: [breakdown.perAnimal[1], { ...breakdown.perAnimal[1], animalName: "Nagini again" }],
    } as any);

    await createOrder("breeder-1", [], "lab-1");

    const [testArgs] = db.shedTestOrderAnimalTest.createMany.mock.calls[0];
    expect(testArgs.data.map((row: any) => row.orderAnimalId)).toEqual(["oa-1", "oa-2"]);
  });

  it("writes no test rows when nothing was selected", async () => {
    vi.mocked(calculateOrderBreakdown).mockReturnValue({
      ...breakdown,
      perAnimal: [{ ...breakdown.perAnimal[1], selectedCatalogTests: [] }],
    } as any);

    await createOrder("breeder-1", [], "lab-1");

    expect(db.shedTestOrderAnimalTest.createMany).not.toHaveBeenCalled();
  });
});
