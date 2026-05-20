import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../services/orderNumberService", () => ({
  ensureSharedOrderNumbers: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import { getOrderByIdForUser, listOrdersForUser } from "../services/orderService";

const order = {
  id: "order-1",
  breederId: "breeder-1",
  animals: [],
  results: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orderService breeder visibility", () => {
  it("lists only the authenticated breeder's orders", async () => {
    vi.mocked((prisma as any).shedTestOrder.findMany).mockResolvedValue([order]);

    const rows = await listOrdersForUser({ id: "breeder-1", role: "breeder" });

    expect(rows).toEqual([order]);
    expect((prisma as any).shedTestOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { breederId: "breeder-1" },
      })
    );
  });

  it("allows lab staff users to list all orders with breeder summaries", async () => {
    vi.mocked((prisma as any).shedTestOrder.findMany).mockResolvedValue([order]);

    await listOrdersForUser({ id: "lab-1", role: "lab_staff" });

    expect((prisma as any).shedTestOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          breeder: expect.any(Object),
        }),
      })
    );
  });

  it("allows breeders to read their own order detail", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue(order);

    const row = await getOrderByIdForUser("order-1", { id: "breeder-1", role: "breeder" });

    expect(row).toBe(order);
  });

  it("blocks breeders from reading another breeder's order detail", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      ...order,
      breederId: "breeder-2",
    });

    await expect(
      getOrderByIdForUser("order-1", { id: "breeder-1", role: "breeder" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("blocks buyers from lab order workflows", async () => {
    await expect(
      listOrdersForUser({ id: "buyer-1", role: "buyer" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((prisma as any).shedTestOrder.findMany).not.toHaveBeenCalled();
  });
});
