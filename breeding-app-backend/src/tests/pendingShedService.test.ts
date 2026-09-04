import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    pendingShedTest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../services/orderService", async () => {
  const actual = await vi.importActual<typeof import("../services/orderService")>(
    "../services/orderService"
  );
  return {
    ...actual,
    createOrder: vi.fn(),
    resolveLabPricingContext: vi.fn(),
  };
});

import { prisma } from "../lib/prisma";
import { createOrder, resolveLabPricingContext } from "../services/orderService";
import {
  addPendingShedTest,
  listPendingShedTests,
  quotePendingShedTests,
  removePendingShedTest,
  submitPendingShedBatch,
  updatePendingShedTest,
} from "../services/pendingShedService";

const db = prisma as any;

const OFFERINGS = [
  { id: "t-clown", name: "Clown", pricingType: "morph", active: true },
  { id: "t-pied", name: "Piebald", pricingType: "morph", active: true },
  { id: "t-sex", name: "Sexing", pricingType: "sex", active: true },
];

const PRICING = {
  id: "pricing-1",
  currency: "EUR",
  morphTier1to9FirstTest: 60,
  morphTier1to9AdditionalTest: 30,
  morphTier10to49FirstTest: 50,
  morphTier10to49AdditionalTest: 25,
  morphTier50PlusFirstTest: 40,
  morphTier50PlusAdditionalTest: 20,
  sexTier1to9: 20,
  sexTier10to49: 15,
  sexTier50Plus: 10,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  breederId: "breeder-1",
  labOrganizationId: "lab-1",
  animalId: "a-1",
  animalDisplayId: null,
  animalName: "Kaa",
  selectedTestIds: ["t-clown"],
  priority: "routine",
  sampleType: "shed",
  notes: null,
  selected: true,
  createdAt: new Date("2026-09-01T09:00:00.000Z"),
  updatedAt: new Date("2026-09-01T09:00:00.000Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveLabPricingContext).mockResolvedValue({
    labName: "Test Lab",
    offerings: OFFERINGS,
    pricing: PRICING,
  } as any);
});

describe("saved shed test queue", () => {
  it("returns the queue in the shape the terminal already reads", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([row()]);

    const items = await listPendingShedTests("breeder-1");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "p-1",
      snakeId: "a-1",
      snakeName: "Kaa",
      labId: "lab-1",
      selectedTestIds: ["t-clown"],
      selected: true,
    });
    expect(db.pendingShedTest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { breederId: "breeder-1" } })
    );
  });

  it("refuses to save a test the laboratory does not offer", async () => {
    await expect(
      addPendingShedTest("breeder-1", {
        labId: "lab-1",
        snakeId: "a-1",
        selectedTestIds: ["t-clown", "t-not-real"],
      })
    ).rejects.toThrow(/no longer offers/i);
    expect(db.pendingShedTest.create).not.toHaveBeenCalled();
  });

  it("requires a laboratory and at least one test", async () => {
    await expect(
      addPendingShedTest("breeder-1", { snakeId: "a-1", selectedTestIds: ["t-clown"] })
    ).rejects.toThrow(/laboratory/i);
    await expect(
      addPendingShedTest("breeder-1", { labId: "lab-1", snakeId: "a-1", selectedTestIds: [] })
    ).rejects.toThrow(/at least one test/i);
  });

  it("drops duplicate test ids when saving", async () => {
    db.pendingShedTest.create.mockResolvedValue(row());

    await addPendingShedTest("breeder-1", {
      labId: "lab-1",
      snakeId: "a-1",
      selectedTestIds: ["t-clown", "t-clown", " t-pied "],
    });

    const [args] = db.pendingShedTest.create.mock.calls[0];
    expect(args.data.selectedTestIds).toEqual(["t-clown", "t-pied"]);
  });

  it("never reaches another keeper's saved test", async () => {
    // findFirst is scoped by breederId, so another owner's row simply is not found.
    db.pendingShedTest.findFirst.mockResolvedValue(null);

    await expect(updatePendingShedTest("breeder-1", "p-someone-else", { selected: false }))
      .rejects.toThrow(/no longer exists/i);
    await expect(removePendingShedTest("breeder-1", "p-someone-else"))
      .rejects.toThrow(/no longer exists/i);

    for (const call of db.pendingShedTest.findFirst.mock.calls) {
      expect(call[0].where.breederId).toBe("breeder-1");
    }
    expect(db.pendingShedTest.delete).not.toHaveBeenCalled();
  });
});

describe("quoting the saved queue", () => {
  it("treats an empty queue as a normal state, not an error", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([]);

    const quote = await quotePendingShedTests("breeder-1");

    expect(quote).toEqual({ items: [], subtotalCents: 0, totalCents: 0, currency: "EUR" });
    expect(resolveLabPricingContext).not.toHaveBeenCalled();
  });

  it("prices the queue as one order rather than row by row", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([
      row({ id: "p-1", animalId: "a-1", selectedTestIds: ["t-clown", "t-pied"] }),
      row({ id: "p-2", animalId: "a-2", selectedTestIds: ["t-clown"] }),
    ]);

    const quote = await quotePendingShedTests("breeder-1");

    // First morph on an animal takes the base price, the second the additional rate.
    expect(quote.items[0].tests.map((entry) => entry.priceCents)).toEqual([6000, 3000]);
    expect(quote.items[0].itemTotalCents).toBe(9000);
    expect(quote.items[1].itemTotalCents).toBe(6000);
    expect(quote.totalCents).toBe(15000);
    expect(quote.items.map((entry) => entry.pendingItemId)).toEqual(["p-1", "p-2"]);
  });

  it("refuses to price two laboratories as one batch", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([
      row({ id: "p-1", labOrganizationId: "lab-1" }),
      row({ id: "p-2", labOrganizationId: "lab-2" }),
    ]);

    await expect(quotePendingShedTests("breeder-1")).rejects.toThrow(/different laboratories/i);
  });
});

describe("submitting the saved queue", () => {
  beforeEach(() => {
    vi.mocked(createOrder).mockResolvedValue({
      id: "order-1",
      totalPrice: "150",
      currency: "EUR",
    } as any);
  });

  it("submits only the ticked rows and turns them into one order", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([
      row({ id: "p-1", animalId: "a-1" }),
      row({ id: "p-2", animalId: "a-2", selectedTestIds: ["t-sex"] }),
    ]);

    const result = await submitPendingShedBatch("breeder-1");

    expect(db.pendingShedTest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { breederId: "breeder-1", selected: true } })
    );
    expect(createOrder).toHaveBeenCalledWith(
      "breeder-1",
      [
        { animalId: "a-1", animalName: "Kaa", selectedTestIds: ["t-clown"] },
        { animalId: "a-2", animalName: "Kaa", selectedTestIds: ["t-sex"] },
      ],
      "lab-1"
    );
    expect(result.batch.itemCount).toBe(2);
    expect(result.batch.orderIds).toEqual(["order-1"]);
    expect(result.batch.totalCents).toBe(15000);
  });

  it("clears the saved rows only after the order exists", async () => {
    const calls: string[] = [];
    db.pendingShedTest.findMany.mockResolvedValue([row()]);
    vi.mocked(createOrder).mockImplementation(async () => {
      calls.push("createOrder");
      return { id: "order-1", totalPrice: "60", currency: "EUR" } as any;
    });
    db.pendingShedTest.deleteMany.mockImplementation(async () => {
      calls.push("deleteMany");
      return { count: 1 };
    });

    await submitPendingShedBatch("breeder-1");

    // A draft deleted inside an order transaction that later rolled back would take the
    // keeper's saved work with it.
    expect(calls).toEqual(["createOrder", "deleteMany"]);
    expect(db.pendingShedTest.deleteMany).toHaveBeenCalledWith({
      where: { breederId: "breeder-1", id: { in: ["p-1"] } },
    });
  });

  it("keeps the saved rows when the order fails", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([row()]);
    vi.mocked(createOrder).mockRejectedValue(new Error("lab unavailable"));

    await expect(submitPendingShedBatch("breeder-1")).rejects.toThrow("lab unavailable");
    expect(db.pendingShedTest.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses an empty selection", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([]);
    await expect(submitPendingShedBatch("breeder-1")).rejects.toThrow(/at least one/i);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("refuses to send one laboratory's samples to another", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([
      row({ id: "p-1", labOrganizationId: "lab-1" }),
      row({ id: "p-2", labOrganizationId: "lab-2" }),
    ]);

    await expect(submitPendingShedBatch("breeder-1")).rejects.toThrow(/different laboratories/i);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("fails rather than silently dropping an id it could not find", async () => {
    db.pendingShedTest.findMany.mockResolvedValue([row({ id: "p-1" })]);

    await expect(submitPendingShedBatch("breeder-1", ["p-1", "p-gone"]))
      .rejects.toThrow(/no longer exist/i);
    expect(createOrder).not.toHaveBeenCalled();
  });
});
