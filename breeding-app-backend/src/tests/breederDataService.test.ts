import { beforeEach, describe, expect, it, vi } from "vitest";

// Existing rows are read in bulk off `prisma` before the transaction opens; the transaction
// itself only carries writes, inserting through createMany.
const tx = {
  animal: { createMany: vi.fn(), update: vi.fn() },
  // Present only so the test can prove a sync never touches either listing store.
  listing: {
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  marketplaceListing: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  pairing: { createMany: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  clutch: { createMany: vi.fn(), update: vi.fn() },
  breederPlannerState: { create: vi.fn(), update: vi.fn() },
  breedingCycle: { createMany: vi.fn(), update: vi.fn() },
  follicleExamination: { createMany: vi.fn(), update: vi.fn() },
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
    animal: { findMany: vi.fn(), count: vi.fn() },
    pairing: { findMany: vi.fn() },
    clutch: { findMany: vi.fn() },
    breederPlannerState: { findUnique: vi.fn() },
    breedingCycle: { findMany: vi.fn() },
    follicleExamination: { findMany: vi.fn() },
  },
}));

// The tier lookup is its own service; these tests set the answer it gives.
vi.mock("../services/subscriptionService", () => ({
  canAccessFeature: vi.fn(),
}));

import { prisma } from "../lib/prisma";
import { canAccessFeature } from "../services/subscriptionService";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";
import { countedAnimalWhere } from "../services/animalArchive";

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
  vi.mocked((prisma as any).breedingCycle.findMany).mockResolvedValue([]);
  vi.mocked((prisma as any).follicleExamination.findMany).mockResolvedValue([]);
  tx.breedingCycle.createMany.mockResolvedValue({ count: 0 });
  tx.follicleExamination.createMany.mockResolvedValue({ count: 0 });
  vi.mocked(canAccessFeature).mockResolvedValue({ allowed: true, featureKey: "animals.create", source: "unconfigured", tier: "Unconfigured" } as any);
});

describe("the tier's animal cap", () => {
  const freeAt = (currentUsage: number) => ({
    allowed: currentUsage < 20,
    featureKey: "animals.create",
    tier: "Free",
    currentTier: "Free",
    currentUsage,
    limit: 20,
    ...(currentUsage >= 20 ? { reason: "Usage limit reached" } : {}),
  });
  const newAnimals = (count: number, from = 1) =>
    Array.from({ length: count }, (_, index) => ({ id: `new-${from + index}`, name: `New ${from + index}` }));

  it("lets an account at its cap keep saving edits", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", { id: "snake-1", name: "Old" }, "2026-01-01T00:00:00.000Z"),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", name: "Renamed", updatedAt: "2026-02-01T00:00:00.000Z" }],
    });

    expect(tx.animal.update).toHaveBeenCalled();
    expect((prisma as any).animal.count).not.toHaveBeenCalled();
  });

  it("accepts new animals up to the cap, counting only live animals", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(19) as any);
    vi.mocked((prisma as any).animal.count).mockResolvedValue(19);

    await upsertBreederSnapshot("breeder-1", { animals: newAnimals(1) });

    expect((prisma as any).animal.count).toHaveBeenCalledWith({ where: countedAnimalWhere("breeder-1") });
    expect(tx.animal.createMany).toHaveBeenCalled();
  });

  it("refuses a save that would take the cloud past the cap, and writes nothing", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(15) as any);
    vi.mocked((prisma as any).animal.count).mockResolvedValue(15);

    await expect(upsertBreederSnapshot("breeder-1", { animals: newAnimals(10) })).rejects.toMatchObject({
      statusCode: 403,
      message: "Free keeps 20 animals in the cloud. This save would bring it to 25, so it was not saved. Every animal is still on this device.",
    });
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it("refuses a first sync of 60 animals on Free instead of letting the request size decide", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(0) as any);
    vi.mocked((prisma as any).animal.count).mockResolvedValue(0);

    await expect(upsertBreederSnapshot("breeder-1", { animals: newAnimals(60) })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("makes room for a new animal when the same save deletes one", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", { id: "snake-1" }),
    ]);
    vi.mocked((prisma as any).animal.count).mockResolvedValueOnce(20).mockResolvedValueOnce(1);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", deletedAt: "2026-03-01T00:00:00.000Z" }, ...newAnimals(1)],
    });

    expect((prisma as any).animal.count).toHaveBeenLastCalledWith({
      where: countedAnimalWhere("breeder-1", { appAnimalId: { in: ["snake-1"] } }),
    });
    expect(tx.animal.createMany).toHaveBeenCalled();
  });

  it("does not count archived animals toward the cap", async () => {
    const where = countedAnimalWhere("breeder-1") as any;
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toContainEqual({ status: null });
    const excluded = where.OR.find((clause: any) => clause.status?.notIn).status.notIn;
    expect(excluded).toEqual(expect.arrayContaining(["Sold", "Deceased", "Archived", "sold"]));
  });

  it("lets an account at its cap archive an animal without a capacity check", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", { id: "snake-1", status: "Breeder" }, "2026-01-01T00:00:00.000Z"),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", status: "Sold", archive: { reason: "sold" }, updatedAt: "2026-02-01T00:00:00.000Z" }],
    });

    expect((prisma as any).animal.count).not.toHaveBeenCalled();
    expect(tx.animal.update).toHaveBeenCalled();
  });

  it("does not count a new animal that arrives already archived", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);

    await upsertBreederSnapshot("breeder-1", { animals: [{ id: "old-sale", status: "Sold" }] });

    expect((prisma as any).animal.count).not.toHaveBeenCalled();
    expect(tx.animal.createMany).toHaveBeenCalled();
  });

  it("counts an archived animal returning to the collection", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", { id: "snake-1", status: "Sold" }, "2026-01-01T00:00:00.000Z"),
    ]);
    vi.mocked((prisma as any).animal.count).mockResolvedValue(20);

    await expect(upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", status: "Active", archive: null, updatedAt: "2026-02-01T00:00:00.000Z" }],
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("makes room for a new animal when the same save archives one", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow("appAnimalId", "snake-1", { id: "snake-1", status: "Breeder" }, "2026-01-01T00:00:00.000Z"),
    ]);
    vi.mocked((prisma as any).animal.count).mockResolvedValueOnce(20).mockResolvedValueOnce(1);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", status: "Deceased", updatedAt: "2026-02-01T00:00:00.000Z" }, ...newAnimals(1)],
    });

    expect(tx.animal.createMany).toHaveBeenCalled();
  });

  it("does not count a deletion of an animal the cloud never had", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue(freeAt(20) as any);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "never-synced", deletedAt: "2026-03-01T00:00:00.000Z" }],
    });

    expect((prisma as any).animal.count).not.toHaveBeenCalled();
    expect(tx.animal.createMany).toHaveBeenCalled();
  });
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

  it("never writes a listing, even for an animal tagged for sale and published", async () => {
    // The snapshot used to mirror sale-tagged animals into the legacy listings
    // table. The one listing pipeline is the explicit publish; a sync must not
    // put anything on sale, or take anything off it, in either store.
    const animal = {
      id: "snake-1",
      status: "For Sale",
      morphs: ["Banana", "Clown"],
      price: "450",
      marketplacePublished: true,
      marketplacePublishedAt: "2026-05-01T20:00:00.000Z",
    };
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([{ payload: animal }]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [animal],
      pairings: [],
    });

    expect(tx.listing.updateMany).not.toHaveBeenCalled();
    expect(tx.listing.upsert).not.toHaveBeenCalled();
    expect(tx.marketplaceListing.create).not.toHaveBeenCalled();
    expect(tx.marketplaceListing.update).not.toHaveBeenCalled();
    expect(tx.marketplaceListing.updateMany).not.toHaveBeenCalled();
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

    // The phone's payload is the later one and now owns the genetics outright, so without
    // re-applying the decision the disproved guess would be back on the animal.
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

  // These lists used to merge as a union, which made a deletion impossible to express: the
  // keeper removed a gene, saved, and the stored copy that still carried it handed it straight
  // back on the next sync -- and the union was then written as canonical, so the gene the keeper
  // had deliberately deleted survived every later refresh.
  it("keeps a gene the keeper deleted out of the stored animal", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        { id: "snake-1", morphs: ["Pastel", "Clown"], hets: ["Pied"], updatedAt: "2026-09-04T10:00:00.000Z" },
        "2026-09-04T10:00:00.000Z"
      ),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{
        id: "snake-1",
        morphs: ["Pastel"],
        hets: [],
        updatedAt: "2026-09-05T10:00:00.000Z",
      }],
      pairings: [],
    });

    const written = tx.animal.update.mock.calls[0][0].data.payload;
    expect(written.morphs).toEqual(["Pastel"]);
    expect(written.hets).toEqual([]);
  });

  // A behind-the-times device does not get to delete anything: its whole payload is rejected
  // before the merge, by the same timestamp gate that already protects every other field.
  it("ignores a deletion pushed by a device that is behind the stored copy", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        { id: "snake-1", morphs: ["Pastel", "Clown"], updatedAt: "2026-09-06T10:00:00.000Z" },
        "2026-09-06T10:00:00.000Z"
      ),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", morphs: ["Pastel"], updatedAt: "2026-09-05T10:00:00.000Z" }],
      pairings: [],
    });

    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  // Equal timestamps mean neither save is demonstrably later, so nothing justifies discarding
  // either side's work.
  it("still unions genetics when both copies carry the same timestamp", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        { id: "snake-1", morphs: ["Pastel", "Clown"], updatedAt: "2026-09-05T10:00:00.000Z" },
        "2026-09-05T10:00:00.000Z"
      ),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", morphs: ["Pastel", "Enchi"], updatedAt: "2026-09-05T10:00:00.000Z" }],
      pairings: [],
    });

    const written = tx.animal.update.mock.calls[0][0].data.payload;
    expect(written.morphs).toEqual(["Pastel", "Clown", "Enchi"]);
  });

  // A payload that never carried the field is not asserting an empty one. Only a side that
  // actually holds genetics can speak for them.
  it("leaves stored genetics alone when the incoming payload omits them", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        { id: "snake-1", morphs: ["Pastel", "Clown"], updatedAt: "2026-09-04T10:00:00.000Z" },
        "2026-09-04T10:00:00.000Z"
      ),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", weight: "1550", updatedAt: "2026-09-05T10:00:00.000Z" }],
      pairings: [],
    });

    const written = tx.animal.update.mock.calls[0][0].data.payload;
    expect(written.morphs).toEqual(["Pastel", "Clown"]);
  });

  // Tags and groups deliberately keep the union: two devices adding a tag each should end up
  // with both, and unlike genetics they are not the record of what the animal is.
  it("still unions tags and groups across devices", async () => {
    vi.mocked((prisma as any).animal.findMany).mockResolvedValue([
      existingRow(
        "appAnimalId",
        "snake-1",
        { id: "snake-1", tags: ["Holdback"], groups: ["Rack A"], updatedAt: "2026-09-04T10:00:00.000Z" },
        "2026-09-04T10:00:00.000Z"
      ),
    ]);

    await upsertBreederSnapshot("breeder-1", {
      animals: [{ id: "snake-1", tags: ["Proven"], groups: ["Rack B"], updatedAt: "2026-09-05T10:00:00.000Z" }],
      pairings: [],
    });

    const written = tx.animal.update.mock.calls[0][0].data.payload;
    expect(written.tags).toEqual(["Holdback", "Proven"]);
    expect(written.groups).toEqual(["Rack A", "Rack B"]);
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
      breedingCycles: [],
      follicleExams: [],
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
      breedingCycles: [],
      follicleExams: [],
      plannerState: null,
      serverTime: expect.any(String),
    });
  });
});
