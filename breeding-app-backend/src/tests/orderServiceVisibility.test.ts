import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../services/orderNumberService", () => ({
  ensureSharedOrderNumbers: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import {
  deleteOrderById,
  getOrderByIdForUser,
  listOrdersForUser,
} from "../services/orderService";

const LAB_A = { organizationId: "org_lab_a" };
const LAB_B = { organizationId: "org_lab_b" };

const order = {
  id: "order-1",
  breederId: "breeder-1",
  labOrganizationId: LAB_A.organizationId,
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

  it("lists only the orders addressed to the acting lab's own organization", async () => {
    vi.mocked((prisma as any).shedTestOrder.findMany).mockResolvedValue([order]);

    await listOrdersForUser({ id: "lab-1", role: "lab_staff" }, LAB_A);

    expect((prisma as any).shedTestOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { labOrganizationId: "org_lab_a" },
        include: expect.objectContaining({
          breeder: expect.any(Object),
        }),
      })
    );
  });

  it("refuses to list orders for a lab account with no organization", async () => {
    await expect(
      listOrdersForUser({ id: "lab-1", role: "lab_staff" }, null)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((prisma as any).shedTestOrder.findMany).not.toHaveBeenCalled();
  });

  it("lists every tenant's orders for a platform admin", async () => {
    vi.mocked((prisma as any).shedTestOrder.findMany).mockResolvedValue([order]);

    await listOrdersForUser({ id: "admin-1", role: "admin" }, null);

    const call = vi.mocked((prisma as any).shedTestOrder.findMany).mock.calls[0][0];
    expect(call.where).toBeUndefined();
  });

  it("hides another lab's order detail behind a 404", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue(order);

    // Deliberately 404 rather than 403: confirming the id exists in another
    // tenant would itself be a disclosure.
    await expect(
      getOrderByIdForUser("order-1", { id: "lab-2", role: "lab_staff" }, LAB_B)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("allows breeders to read their own order detail", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue(order);

    const row = await getOrderByIdForUser("order-1", { id: "breeder-1", role: "breeder" }, null);

    expect(row).toBe(order);
  });

  it("blocks breeders from reading another breeder's order detail", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      ...order,
      breederId: "breeder-2",
    });

    await expect(
      getOrderByIdForUser("order-1", { id: "breeder-1", role: "breeder" }, null)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("blocks buyers from lab order workflows", async () => {
    await expect(
      listOrdersForUser({ id: "buyer-1", role: "buyer" }, null)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect((prisma as any).shedTestOrder.findMany).not.toHaveBeenCalled();
  });

  it("deletes order rows without touching persisted animal genetics", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      id: "order-1",
      labOrganizationId: LAB_A.organizationId,
      animals: [
        {
          id: "order-animal-1",
          animalId: "snake-1",
          tests: [{ id: "test-1" }, { id: "test-2" }],
        },
      ],
      results: [{ id: "result-1" }],
    });
    vi.mocked((prisma as any).shedTestOrder.delete).mockResolvedValue({ id: "order-1" });

    await expect(
      deleteOrderById("order-1", { role: "lab_staff" }, LAB_A)
    ).resolves.toEqual({
      deletedOrderId: "order-1",
      deletedAnimals: 1,
      deletedAnimalTests: 2,
      deletedResults: 1,
    });

    expect((prisma as any).shedTestOrder.delete).toHaveBeenCalledWith({
      where: { id: "order-1" },
    });
    expect((prisma as any).animal).toBeUndefined();
  });

  it("refuses to delete an order belonging to another lab", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      id: "order-1",
      labOrganizationId: LAB_A.organizationId,
      animals: [],
      results: [],
    });

    await expect(
      deleteOrderById("order-1", { role: "lab_staff" }, LAB_B)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((prisma as any).shedTestOrder.delete).not.toHaveBeenCalled();
  });
});
