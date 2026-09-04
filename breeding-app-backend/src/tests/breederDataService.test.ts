import { beforeEach, describe, expect, it, vi } from "vitest";

// Existing rows are read in bulk off `prisma` before the transaction opens; the transaction
// itself only carries writes, inserting through createMany.
const tx = {
  animal: { createMany: vi.fn(), update: vi.fn() },
  listing: {
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  pairing: { createMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  clutch: { createMany: vi.fn(), update: vi.fn() },
  breederPlannerState: { create: vi.fn(), update: vi.fn() },
};

// A row as the bulk pre-load sees it: the app-side id is what keys the lookup, so a row without
// one reads as "not stored yet".
const existingRow = (appIdField: string, appId: string, payload: unknown, updatedAt?: string) => ({
  id: `${appIdField}-row-1`,
  [appIdField]: appId,
  payload,
  updatedAt: updatedAt ? new Date(updatedAt) : undefined,
});

vi.mock("../lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback) => callback(tx)),
    animal: { findMany: vi.fn() },
    pairing: { findMany: vi.fn() },
    clutch: { findMany: vi.fn() },
    breederPlannerState: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";

beforeEach(() => {
  vi.clearAllMocks();
  tx.animal.createMany.mockResolvedValue({ count: 1 });
  tx.animal.update.mockResolvedValue({ id: "animal-row-1" });
  tx.listing.updateMany.mockResolvedValue({ count: 0 });
  tx.listing.upsert.mockResolvedValue({ id: "listing-row-1" });
  tx.pairing.createMany.mockResolvedValue({ count: 1 });
  tx.pairing.update.mockResolvedValue({ id: "pairing-row-1" });
  // Resolves the row ids of pairings inserted by this request, which clutches reference.
  tx.pairing.findMany.mockResolvedValue([{ id: "pairing-row-1", appPairingId: "pairing-1" }]);
  tx.clutch.createMany.mockResolvedValue({ count: 1 });
  tx.clutch.update.mockResolvedValue({ id: "clutch-row-1" });
  tx.breederPlannerState.create.mockResolvedValue({ id: "planner-state-row-1" });
  tx.breederPlannerState.update.mockResolvedValue({ id: "planner-state-row-1" });
  vi.mocked((prisma as any).animal.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).pairing.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).clutch.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).breederPlannerState.findUnique).mockResolvedValue(null);
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

    // Existing rows are read once per table for the whole owner, not once per incoming record.
    expect((prisma as any).animal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: "breeder-1" },
    }));
    expect((prisma as any).pairing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ownerId: "breeder-1" },
    }));

    expect(tx.animal.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ ownerId: "breeder-1", appAnimalId: "snake-1", name: "Saliso" }),
      ]),
    }));
    expect(tx.pairing.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ maleAnimalAppId: "snake-1", femaleAnimalAppId: "snake-2" }),
      ]),
    }));
    // The clutch still lands on the row id of the pairing created moments earlier in the same
    // request, which is the one ordering constraint the batching has to preserve.
    expect(tx.clutch.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ ownerId: "breeder-1", pairingId: "pairing-row-1", laidDate: "2026-04-20" }),
      ]),
    }));
  });

  it("mirrors structured completion metadata when syncing a completed pairing", async () => {
    await upsertBreederSnapshot("breeder-1", {
      animals: [],
      pairings: [{
        id: "pairing-1",
        label: "Season close",
        workflowStatus: "completed",
        status: "completed",
        completionReason: "no_ovulation_observed",
        outcomeConfidence: "likely",
        completedAt: "2026-05-01T10:00:00.000Z",
        completionNote: "No ovulation observed by end of season.",
      }],
    });

    expect(tx.pairing.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({
          workflowStatus: "completed",
          completionReason: "no_ovulation_observed",
          outcomeConfidence: "likely",
          completedAt: new Date("2026-05-01T10:00:00.000Z"),
          completionNote: "No ovulation observed by end of season.",
        }),
      ]),
    }));
  });

  it("rejects completed pairings without a completion reason", async () => {
    await expect(upsertBreederSnapshot("breeder-1", {
      animals: [],
      pairings: [{
        id: "pairing-1",
        workflowStatus: "completed",
        outcomeConfidence: "likely",
      }],
    })).rejects.toMatchObject({ statusCode: 400 });
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
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", existingPayload, "2026-07-03T10:00:00.000Z"),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        name: "Older name",
        updatedAt: "2026-07-02T10:00:00.000Z",
      }],
      pairings: [],
    });

    expect(tx.animal.update).not.toHaveBeenCalled();
    // Nor may the stale record sneak in as an insert: the row was recognised as already stored.
    expect(tx.animal.createMany).not.toHaveBeenCalled();
  });

  it("does not let a stale device resurrect a gene the laboratory disproved", async () => {
    // The lab tested this animal and cleared the guess. The stored payload carries
    // the decision that settled it.
    const labConfirmation = {
      source: "genetic-test",
      note: "Confirmed by shed test",
      confirmedAt: "2026-09-04T10:00:00.000Z",
      markers: [],
      decisions: [{ key: "clown", gene: "Clown", outcome: "notDetected" }],
    };
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        {
          id: "snake-1",
          morphs: [],
          hets: [],
          possibleHets: [],
          labGeneticsConfirmation: labConfirmation,
          updatedAt: "2026-09-04T10:00:00.000Z",
        },
        "2026-09-04T10:00:00.000Z"
      ),
    ]);

    // A phone that has not synced since before the test still holds the guess, and
    // pushes it with a newer timestamp because the keeper edited something else.
    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        morphs: [],
        hets: [],
        possibleHets: ["66% poss het Clown"],
        labGeneticsConfirmation: labConfirmation,
        updatedAt: "2026-09-05T10:00:00.000Z",
      }],
      pairings: [],
    });

    // The genetics arrays merge as a union, so without re-applying the decision
    // the disproved guess would be back on the animal.
    const written = tx.animal.update.mock.calls[0][0].data.payload;
    expect(written.possibleHets).toEqual([]);
  });

  it("still accepts genetics a laboratory never ruled on", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        {
          id: "snake-1",
          morphs: ["Pastel"],
          labGeneticsConfirmation: {
            source: "genetic-test",
            note: "Confirmed by shed test",
            confirmedAt: "2026-09-04T10:00:00.000Z",
            markers: [],
            decisions: [{ key: "clown", gene: "Clown", outcome: "notDetected" }],
          },
          updatedAt: "2026-09-04T10:00:00.000Z",
        },
        "2026-09-04T10:00:00.000Z"
      ),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        morphs: ["Pastel", "Enchi"],
        updatedAt: "2026-09-05T10:00:00.000Z",
      }],
      pairings: [],
    });

    const written = tx.animal.update.mock.calls[0][0].data.payload;
    expect(written.morphs).toEqual(["Pastel", "Enchi"]);
  });

  it("merges nested animal logs when the incoming animal is newer", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", {
        id: "snake-1",
        name: "Original",
        updatedAt: "2026-07-03T10:00:00.000Z",
        logs: {
          feeds: [{ id: "feed-old", date: "2026-07-02", result: "Fed" }],
        },
        photos: [{ id: "photo-old", addedAt: "2026-07-03T09:00:00.000Z", url: "old.jpg" }],
      }, "2026-07-03T10:00:00.000Z"),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        name: "Updated",
        updatedAt: "2026-07-04T10:00:00.000Z",
        logs: {
          feeds: [{ id: "feed-new", date: "2026-07-04", result: "Fed" }],
        },
        photos: [{ id: "photo-new", addedAt: "2026-07-04T09:00:00.000Z", url: "new.jpg" }],
      }],
      pairings: [],
    });

    expect(tx.animal.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          name: "Updated",
          logs: expect.objectContaining({
            feeds: expect.arrayContaining([
              expect.objectContaining({ id: "feed-old" }),
              expect.objectContaining({ id: "feed-new" }),
            ]),
          }),
          photos: expect.arrayContaining([
            expect.objectContaining({ id: "photo-old" }),
            expect.objectContaining({ id: "photo-new" }),
          ]),
        }),
      }),
    }));
  });

  // The regression this guards: reads used to be issued one findUnique per incoming record from
  // inside the write transaction. At a few thousand records the sequential round-trips ran past
  // the transaction budget, Prisma closed the transaction, and the sync died on P2028 -> 500.
  it("reads once per table regardless of record count, and writes nothing when nothing changed", async () => {
    const stored = Array.from({ length: 500 }, (_, index) => ({
      id: `snake-${index}`,
      name: `Animal ${index}`,
      updatedAt: "2026-07-03T10:00:00.000Z",
    }));
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue(
      stored.map(payload => existingRow("appAnimalId", payload.id, payload, "2026-07-03T10:00:00.000Z")),
    );

    await upsertBreederSnapshot("breeder-1", {
      // Same records the server already has, none of them touched since.
      animals: stored.map(payload => ({ ...payload, updatedAt: "2026-07-02T10:00:00.000Z" })),
      pairings: [],
    });

    // Once for the pre-load, once for the snapshot returned to the caller — not 500 times.
    expect((prisma as any).animal.findMany).toHaveBeenCalledTimes(2);
    expect(tx.animal.createMany).not.toHaveBeenCalled();
    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  // The bug this guards produced 222,517 weight entries for 116 real readings: the client minted a
  // random id for every id-less log entry on every merge, and the server kept the id-less original
  // (keyed by content), so each sync added one more "distinct" copy of the same reading.
  it("collapses an id-less log entry into the identical entry that carries an id", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", {
        id: "snake-1",
        updatedAt: "2026-07-03T10:00:00.000Z",
        logs: { weights: [{ date: "2025-11-29", grams: 1550, notes: "" }] },
      }, "2026-07-03T10:00:00.000Z"),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        updatedAt: "2026-07-04T10:00:00.000Z",
        logs: { weights: [{ id: "log-abc123", date: "2025-11-29", grams: 1550, notes: "" }] },
      }],
      pairings: [],
    });

    const written = tx.animal.update.mock.calls[0][0].data.payload.logs.weights;
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ id: "log-abc123", grams: 1550 });
  });

  it("keeps genuinely different readings on the same day apart", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", {
        id: "snake-1",
        updatedAt: "2026-07-03T10:00:00.000Z",
        logs: { weights: [{ id: "log-1", date: "2025-11-29", grams: 1550 }] },
      }, "2026-07-03T10:00:00.000Z"),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        updatedAt: "2026-07-04T10:00:00.000Z",
        logs: {
          weights: [
            { id: "log-1", date: "2025-11-29", grams: 1550 },
            { id: "log-2", date: "2025-11-29", grams: 1602 },
          ],
        },
      }],
      pairings: [],
    });

    expect(tx.animal.update.mock.calls[0][0].data.payload.logs.weights).toHaveLength(2);
  });

  it("returns only the records it wrote when the caller asks for a changed-only ack", async () => {
    const saved = { id: "snake-1", name: "Saliso" };
    vi.mocked((prisma as any).animal.findMany)
      .mockResolvedValueOnce([])                      // bulk pre-load: nothing stored yet
      .mockResolvedValueOnce([{ payload: saved }]);   // snapshot read after the write
    vi.mocked((prisma as any).pairing.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ payload: { id: "pairing-untouched" } }]);

    const result: any = await upsertBreederSnapshot("breeder-1", {
      animals: [saved],
      pairings: [],
    });

    expect(result.snapshot.animals).toHaveLength(1);
    expect(result.changed.animals).toEqual([expect.objectContaining({ id: "snake-1" })]);
    // The pairing exists on the account but this request did not touch it, so it stays out.
    expect(result.changed.pairings).toEqual([]);
    expect(result.changed.partial).toBe(true);
  });

  it("returns a delta plus explicit tombstones when given a since cursor", async () => {
    const since = new Date("2026-07-01T00:00:00.000Z");
    vi.mocked((prisma as any).animal.findMany)
      .mockResolvedValueOnce([{ payload: { id: "snake-changed" } }])   // changed since
      .mockResolvedValueOnce([{ appAnimalId: "snake-deleted" }]);      // tombstoned since
    vi.mocked((prisma as any).pairing.findMany).mockResolvedValue([]);
    vi.mocked((prisma as any).clutch.findMany).mockResolvedValue([]);

    const result: any = await listBreederSnapshot("breeder-1", { since });

    expect((prisma as any).animal.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ ownerId: "breeder-1", updatedAt: { gt: since } }),
    }));
    expect(result.partial).toBe(true);
    expect(result.animals).toEqual([{ id: "snake-changed" }]);
    // A deletion cannot be conveyed by omission in a delta, so it is named.
    expect(result.deleted.animals).toEqual(["snake-deleted"]);
  });

  it("persists and lists owner planner state", async () => {
    await upsertBreederSnapshot("breeder-1", {
      animals: [],
      pairings: [],
      plannerState: {
        updatedAt: "2026-07-04T12:00:00.000Z",
        groups: ["Breeders"],
        rooms: [{ id: "room-1", name: "Main room" }],
      },
    });

    expect(tx.breederPlannerState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: "breeder-1",
        payload: expect.objectContaining({
          groups: ["Breeders"],
          rooms: [expect.objectContaining({ id: "room-1" })],
        }),
      }),
    });

    vi.mocked((prisma as any).breederPlannerState.findUnique).mockResolvedValue({
      payload: { groups: ["Breeders"], updatedAt: "2026-07-04T12:00:00.000Z" },
    });

    await expect(listBreederSnapshot("breeder-1")).resolves.toEqual({
      animals: [],
      pairings: [],
      clutches: [],
      plannerState: { groups: ["Breeders"], updatedAt: "2026-07-04T12:00:00.000Z" },
      serverTime: expect.any(String),
    });
  });

  it("lists persisted payloads without leaking database wrapper fields", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([{ payload: { id: "snake-1" } }]);
    vi.mocked((prisma as any).pairing.findMany).mockResolvedValue([{ payload: { id: "pairing-1" } }]);
    vi.mocked((prisma as any).clutch.findMany).mockResolvedValue([{ payload: { id: "clutch-1" } }]);

    await expect(listBreederSnapshot("breeder-1")).resolves.toEqual({
      animals: [{ id: "snake-1" }],
      pairings: [{ id: "pairing-1" }],
      clutches: [{ id: "clutch-1" }],
      plannerState: null,
      serverTime: expect.any(String),
    });
  });
});
