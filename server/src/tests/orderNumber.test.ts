import { describe, expect, it } from "vitest";
import { buildNextOrderNumber, ensureSharedOrderNumbers } from "../services/orderNumberService";

describe("orderNumberService", () => {
  it("builds the expected MM + letters + digits format", () => {
    expect(buildNextOrderNumber([], new Date("2026-04-24T10:00:00.000Z"))).toBe("04AA00001");
    expect(buildNextOrderNumber(["04AA00001"], new Date("2026-04-24T10:00:00.000Z"))).toBe("04AA00002");
    expect(buildNextOrderNumber(["04AA09999"], new Date("2026-04-24T10:00:00.000Z"))).toBe("04AB00001");
  });

  it("backfills missing shared order numbers in created order", async () => {
    const updates: Array<{ id: string; orderNumber: string }> = [];
    const db = {
      shedTestOrder: {
        findMany: async () => [
          { id: "order-1", createdAt: new Date("2026-04-01T09:00:00.000Z"), orderNumber: null },
          { id: "order-2", createdAt: new Date("2026-04-02T09:00:00.000Z"), orderNumber: null },
          { id: "order-3", createdAt: new Date("2026-05-02T09:00:00.000Z"), orderNumber: null },
        ],
        update: async ({ where, data }: any) => {
          updates.push({ id: where.id, orderNumber: data.orderNumber });
          return {};
        },
      },
    };

    await ensureSharedOrderNumbers(db as any);

    expect(updates).toEqual([
      { id: "order-1", orderNumber: "04AA00001" },
      { id: "order-2", orderNumber: "04AA00002" },
      { id: "order-3", orderNumber: "05AA00001" },
    ]);
  });
});
