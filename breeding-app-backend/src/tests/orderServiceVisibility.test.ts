import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    shedTestOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    shedTestCertificate: {
      count: vi.fn(),
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
  setOrderArchived,
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
  vi.mocked((prisma as any).shedTestCertificate.count).mockResolvedValue(0);
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
        // Archived orders are out of the working queue by default: that is the
        // entire difference between archiving an order and deleting it.
        where: { labOrganizationId: "org_lab_a", archivedAt: null },
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
    expect(call.where).toEqual({ archivedAt: null });
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
      preservedCertificates: 0,
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

  it("reports the certificates a deletion leaves standing", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      id: "order-1",
      labOrganizationId: LAB_A.organizationId,
      animals: [],
      results: [{ id: "result-1" }],
    });
    vi.mocked((prisma as any).shedTestOrder.delete).mockResolvedValue({ id: "order-1" });
    vi.mocked((prisma as any).shedTestCertificate.count).mockResolvedValue(2);

    const result = await deleteOrderById("order-1", { role: "lab_staff" }, LAB_A);

    // The certificate rows are not deleted alongside the order -- the foreign
    // key nulls out instead -- so the lab can be told what the breeder keeps.
    expect(result.preservedCertificates).toBe(2);
    expect((prisma as any).shedTestCertificate.count).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
    });
  });
});

describe("orderService archiving", () => {
  const archivable = {
    id: "order-1",
    labOrganizationId: LAB_A.organizationId,
    archivedAt: null,
  };

  it("stamps the archive date and the member who filed it", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue(archivable);
    vi.mocked((prisma as any).shedTestOrder.update).mockResolvedValue({ id: "order-1" });

    await setOrderArchived("order-1", true, { id: "lab-1", role: "lab_staff" }, LAB_A);

    const call = vi.mocked((prisma as any).shedTestOrder.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "order-1" });
    expect(call.data.archivedById).toBe("lab-1");
    expect(call.data.archivedAt).toBeInstanceOf(Date);
  });

  it("clears both archive columns when restoring", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      ...archivable,
      archivedAt: new Date("2026-01-05T10:00:00.000Z"),
    });
    vi.mocked((prisma as any).shedTestOrder.update).mockResolvedValue({ id: "order-1" });

    await setOrderArchived("order-1", false, { id: "lab-1", role: "lab_staff" }, LAB_A);

    const call = vi.mocked((prisma as any).shedTestOrder.update).mock.calls[0][0];
    expect(call.data).toEqual({ archivedAt: null, archivedById: null });
  });

  it("leaves an already-archived order's date alone", async () => {
    // Otherwise re-archiving would move the order between months in the
    // year/month archive for no reason the lab did anything to cause.
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue({
      ...archivable,
      archivedAt: new Date("2026-01-05T10:00:00.000Z"),
    });

    await setOrderArchived("order-1", true, { id: "lab-1", role: "lab_staff" }, LAB_A);

    expect((prisma as any).shedTestOrder.update).not.toHaveBeenCalled();
  });

  it("refuses to archive another laboratory's order", async () => {
    vi.mocked((prisma as any).shedTestOrder.findUnique).mockResolvedValue(archivable);

    await expect(
      setOrderArchived("order-1", true, { id: "lab-2", role: "lab_staff" }, LAB_B)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect((prisma as any).shedTestOrder.update).not.toHaveBeenCalled();
  });

  it("lists the archive when asked for it, and everything when asked for that", async () => {
    vi.mocked((prisma as any).shedTestOrder.findMany).mockResolvedValue([]);

    await listOrdersForUser({ id: "lab-1", role: "lab_staff" }, LAB_A, {
      archiveScope: "archived",
    });
    expect(
      vi.mocked((prisma as any).shedTestOrder.findMany).mock.calls[0][0].where
    ).toEqual({ labOrganizationId: "org_lab_a", archivedAt: { not: null } });

    await listOrdersForUser({ id: "lab-1", role: "lab_staff" }, LAB_A, { archiveScope: "all" });
    expect(
      vi.mocked((prisma as any).shedTestOrder.findMany).mock.calls[1][0].where
    ).toEqual({ labOrganizationId: "org_lab_a" });
  });

  it("never hides an order from the breeder who paid for it", async () => {
    vi.mocked((prisma as any).shedTestOrder.findMany).mockResolvedValue([]);

    // Archiving is the laboratory filing its own copy away. The breeder's list
    // is unfiltered whatever scope is asked for.
    await listOrdersForUser({ id: "breeder-1", role: "breeder" }, null, {
      archiveScope: "active",
    });

    expect(
      vi.mocked((prisma as any).shedTestOrder.findMany).mock.calls[0][0].where
    ).toEqual({ breederId: "breeder-1" });
  });
});
