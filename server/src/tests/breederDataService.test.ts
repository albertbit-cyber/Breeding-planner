import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  animal: { upsert: vi.fn() },
  pairing: { upsert: vi.fn() },
  clutch: { upsert: vi.fn() },
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
  tx.animal.upsert.mockResolvedValue({ id: "animal-row-1" });
  tx.pairing.upsert.mockResolvedValue({ id: "pairing-row-1" });
  tx.clutch.upsert.mockResolvedValue({ id: "clutch-row-1" });
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

    expect(tx.animal.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appAnimalId: { ownerId: "breeder-1", appAnimalId: "snake-1" } },
      create: expect.objectContaining({ ownerId: "breeder-1", appAnimalId: "snake-1", name: "Saliso" }),
    }));
    expect(tx.pairing.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appPairingId: { ownerId: "breeder-1", appPairingId: "pairing-1" } },
      create: expect.objectContaining({ maleAnimalAppId: "snake-1", femaleAnimalAppId: "snake-2" }),
    }));
    expect(tx.clutch.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId_appClutchId: { ownerId: "breeder-1", appClutchId: "pairing-pairing-1-clutch" } },
      create: expect.objectContaining({ ownerId: "breeder-1", pairingId: "pairing-row-1", laidDate: "2026-04-20" }),
    }));
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
