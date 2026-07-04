import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  animal: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  listing: {
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  pairing: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  clutch: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

vi.mock("../lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => callback(tx)),
    animal: { findMany: vi.fn() },
    pairing: { findMany: vi.fn() },
    clutch: { findMany: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";

beforeEach(() => {
  vi.clearAllMocks();
  tx.animal.findUnique.mockResolvedValue(null);
  tx.animal.create.mockResolvedValue({ id: "animal-row-1" });
  tx.animal.update.mockResolvedValue({ id: "animal-row-1" });
  tx.listing.updateMany.mockResolvedValue({ count: 0 });
  tx.listing.upsert.mockResolvedValue({ id: "listing-row-1" });
  tx.pairing.findUnique.mockResolvedValue(null);
  tx.pairing.create.mockResolvedValue({ id: "pairing-row-1" });
  tx.pairing.update.mockResolvedValue({ id: "pairing-row-1" });
  tx.clutch.findUnique.mockResolvedValue(null);
  tx.clutch.create.mockResolvedValue({ id: "clutch-row-1" });
  tx.clutch.update.mockResolvedValue({ id: "clutch-row-1" });
  vi.mocked((prisma as any).animal.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).pairing.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).clutch.findMany).mockResolvedValue([]);
});

describe("breederDataService", () => {
  it("upserts animals, pairings, and nested clutches by owner scoped app ids", async () => {
    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", name: "Saliso", sex: "male", status: "holdback" }],
      pairings: [{
        id: "pairing-1",
        label: "Clutch #1",
        maleId: "snake-1",
        femaleId: "snake-2",
        status: "active",
        startDate: "2026-03-01",
        clutch: { recorded: true, date: "2026-04-20", fertileEggs: 6, slugs: 1 },
      }],
    });

    expect(tx.animal.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appAnimalId: { ownerId: "breeder-1", appAnimalId: "snake-1" } },
    }));
    expect(tx.animal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerId: "breeder-1", appAnimalId: "snake-1", name: "Saliso" }),
    });
    expect(tx.pairing.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appPairingId: { ownerId: "breeder-1", appPairingId: "pairing-1" } },
    }));
    expect(tx.pairing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ maleAnimalAppId: "snake-1", femaleAnimalAppId: "snake-2" }),
    });
    expect(tx.clutch.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appClutchId: { ownerId: "breeder-1", appClutchId: "pairing-pairing-1-clutch" } },
    }));
    expect(tx.clutch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerId: "breeder-1", pairingId: "pairing-row-1", laidDate: "2026-04-20" }),
    });
  });

  it("syncs animals tagged for sale into uniform marketplace listings", async () => {
    const animal = {
      id: "snake-1",
      name: "Banana Clown Female",
      sex: "female",
      status: "For Sale",
      morphs: ["Banana", "Clown"],
      hets: ["Pied"],
      price: "450",
      imageUrl: "https://example.com/snake.jpg",
      marketplacePublished: true,
      marketplacePublishedAt: "2026-05-01T20:00:00.000Z",
    };
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([{ payload: animal }]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [animal],
      pairings: [],
    });

    expect(tx.listing.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        ownerId: "breeder-1",
        appListingId: { startsWith: "auto-animal-" },
      }),
      data: { status: "hidden" },
    }));
    expect(tx.listing.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appListingId: { ownerId: "breeder-1", appListingId: "auto-animal-snake-1" } },
      create: expect.objectContaining({
        ownerId: "breeder-1",
        appListingId: "auto-animal-snake-1",
        animalAppId: "snake-1",
        title: "Banana, Clown, het Pied",
        status: "available",
        priceCents: 45000,
        payload: expect.objectContaining({
          source: "breeder-animal-tag",
          genetics: "Banana, Clown, het Pied",
          imageUrl: "https://example.com/snake.jpg",
          marketplacePublished: true,
          marketplacePublishedAt: "2026-05-01T20:00:00.000Z",
          price: "450",
        }),
      }),
    }));
  });

  it("does not publish sale-tagged animals until explicitly published", async () => {
    const animal = {
      id: "snake-1",
      status: "For Sale",
      morphs: ["Clown"],
    };
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([{ payload: animal }]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [animal],
      pairings: [],
    });

    expect(tx.listing.updateMany).toHaveBeenCalled();
    expect(tx.listing.upsert).not.toHaveBeenCalled();
  });

  it("does not overwrite newer database rows with older incoming animal payloads", async () => {
    const existingPayload = {
      id: "snake-1",
      name: "Newest name",
      updatedAt: "2026-07-03T10:00:00.000Z",
    };
    tx.animal.findUnique.mockResolvedValueOnce({
      id: "animal-row-1",
      payload: existingPayload,
      updatedAt: new Date("2026-07-03T10:00:00.000Z"),
    });
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([{ payload: existingPayload }]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        name: "Older name",
        updatedAt: "2026-07-02T10:00:00.000Z",
      }],
      pairings: [],
    });

    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  it("lists persisted payloads without leaking database wrapper fields", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([{ payload: { id: "snake-1" } }]);
    vi.mocked((prisma as any).pairing.findMany).mockResolvedValue([{ payload: { id: "pairing-1" } }]);
    vi.mocked((prisma as any).clutch.findMany).mockResolvedValue([{ payload: { id: "clutch-1" } }]);

    await expect(listBreederSnapshot("breeder-1")).resolves.toEqual({
      animals: [{ id: "snake-1" }],
      pairings: [{ id: "pairing-1" }],
      clutches: [{ id: "clutch-1" }],
    });
  });
});
