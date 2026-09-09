import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => ({
  prisma: {
    animal: { findMany: vi.fn(), findFirst: vi.fn() },
    shedTestCertificate: { findMany: vi.fn(), findFirst: vi.fn() },
    parentRelationship: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from "../lib/prisma";
import { buildListingRecords, findUnpublishedEvidence } from "../services/marketplaceRecordService";

const db = prisma as any;

const ALL_ON = {
  showWeightHistory: true,
  showFeedingHistory: true,
  showLineage: true,
  showGeneticTestResult: true,
};

const listing = (over: Record<string, unknown> = {}) => ({
  id: "listing-1",
  sellerUserId: "breeder-1",
  animalId: "26-F-148",
  images: [{ id: "i1" }, { id: "i2" }],
  publicDataSettingsJson: { ...ALL_ON },
  ...over,
});

const animal = (payload: Record<string, unknown> = {}) => ({
  id: "animal-row-1",
  ownerId: "breeder-1",
  appAnimalId: "26-F-148",
  payload: {
    logs: {
      weights: [
        { date: "2025-07-01", grams: 62 },
        { date: "2025-09-01", grams: 180 },
        { date: "2026-01-01", grams: 420 },
      ],
      feeds: [{ date: "2026-09-04" }, { date: "2026-08-25" }, { date: "2026-08-16", result: "refused" }],
    },
    ...payload,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.animal.findMany.mockResolvedValue([animal()]);
  db.shedTestCertificate.findMany.mockResolvedValue([
    {
      breederId: "breeder-1",
      animalAppId: "26-F-148",
      certificateNumber: "SL-2026-0418",
      verificationCode: "X7K2",
      issuedAt: new Date("2026-03-14T00:00:00.000Z"),
      labOrganization: { name: "Serpentora Lab" },
    },
  ]);
  db.parentRelationship.findMany.mockResolvedValue([
    { childId: "animal-row-1", role: "sire", parent: { appAnimalId: "22-M-003", name: "Pastel Clown" } },
    { childId: "animal-row-1", role: "dam", parent: { appAnimalId: "21-F-011", name: null } },
  ]);
});

describe("marketplaceRecordService", () => {
  it("fills every provenance segment when the record exists and the seller published it", async () => {
    const records = await buildListingRecords([listing()]);
    const record = records.get("listing-1")!;

    expect(record.provenance).toEqual({
      photos: true,
      weights: true,
      lineage: true,
      verifiedGenetics: true,
      filled: 4,
    });
    expect(record.certificate?.certificateNumber).toBe("SL-2026-0418");
    expect(record.certificate?.labName).toBe("Serpentora Lab");
    expect(record.weights).toHaveLength(3);
    expect(record.feeding).toEqual({ count: 3, lastFedAt: "2026-09-04", refusalsSince: 1 });
    expect(record.lineage?.parents.map((parent) => parent.label)).toEqual(["Pastel Clown", "21-F-011"]);
  });

  it("publishes nothing when the switches are off, however complete the record is", async () => {
    const records = await buildListingRecords([listing({ publicDataSettingsJson: {} })]);
    const record = records.get("listing-1")!;

    // Photos are not gated by a switch -- they are the listing's own images.
    expect(record.provenance).toEqual({
      photos: true,
      weights: false,
      lineage: false,
      verifiedGenetics: false,
      filled: 1,
    });
    expect(record.weights).toEqual([]);
    expect(record.feeding).toBeNull();
    expect(record.certificate).toBeNull();
  });

  it("cannot be inflated by switching on a segment with nothing behind it", async () => {
    // The whole point of the meter: a seller with an empty log turning every
    // switch on must not out-rank a seller who actually logged the animal.
    db.animal.findMany.mockResolvedValue([animal({ logs: { weights: [{ date: "2026-01-01", grams: 400 }], feeds: [] } })]);
    db.shedTestCertificate.findMany.mockResolvedValue([]);
    db.parentRelationship.findMany.mockResolvedValue([]);

    const records = await buildListingRecords([listing()]);
    const record = records.get("listing-1")!;

    expect(record.provenance.weights).toBe(false); // one entry is not a history
    expect(record.provenance.lineage).toBe(false);
    expect(record.provenance.verifiedGenetics).toBe(false);
    expect(record.provenance.filled).toBe(1);
  });

  it("needs two photos before the photo segment counts", async () => {
    const records = await buildListingRecords([listing({ images: [{ id: "only-one" }] })]);
    expect(records.get("listing-1")!.provenance.photos).toBe(false);
  });

  it("returns an empty record for a listing not linked to an animal", async () => {
    const records = await buildListingRecords([listing({ animalId: null })]);
    const record = records.get("listing-1")!;

    expect(record.provenance.filled).toBe(1); // photos only
    expect(record.certificate).toBeNull();
    expect(db.animal.findMany).not.toHaveBeenCalled();
  });

  it("resolves a page of listings with one animal query, not one per row", async () => {
    db.animal.findMany.mockResolvedValue([
      animal(),
      { ...animal(), id: "animal-row-2", appAnimalId: "26-M-091" },
    ]);
    await buildListingRecords([listing(), listing({ id: "listing-2", animalId: "26-M-091" })]);

    expect(db.animal.findMany).toHaveBeenCalledTimes(1);
    expect(db.shedTestCertificate.findMany).toHaveBeenCalledTimes(1);
    expect(db.animal.findMany.mock.calls[0][0].where.appAnimalId.in).toEqual(["26-F-148", "26-M-091"]);
  });

  it("does not leak one seller's animal into another seller's listing", async () => {
    // Same appAnimalId, different owner: keying on the id alone would hand a
    // rival breeder's husbandry record to this listing.
    db.animal.findMany.mockResolvedValue([{ ...animal(), ownerId: "breeder-2" }]);
    db.parentRelationship.findMany.mockResolvedValue([]);
    db.shedTestCertificate.findMany.mockResolvedValue([]);

    const records = await buildListingRecords([listing()]);
    expect(records.get("listing-1")!.provenance.weights).toBe(false);
    expect(records.get("listing-1")!.weights).toEqual([]);
  });
});

describe("findUnpublishedEvidence", () => {
  beforeEach(() => {
    db.animal.findFirst.mockResolvedValue(animal());
    db.shedTestCertificate.findFirst.mockResolvedValue({ certificateNumber: "SL-2026-0418" });
    db.parentRelationship.count.mockResolvedValue(2);
  });

  it("names what the seller holds but has not published", async () => {
    const missing = await findUnpublishedEvidence(listing({ publicDataSettingsJson: {} }));
    expect(missing).toEqual(["geneticTest", "weightHistory", "feedingHistory", "lineage"]);
  });

  it("stays quiet when everything on file is already published", async () => {
    expect(await findUnpublishedEvidence(listing())).toEqual([]);
  });

  it("stays quiet when there is nothing on file to publish", async () => {
    db.animal.findFirst.mockResolvedValue({ id: "animal-row-1", payload: { logs: {} } });
    db.shedTestCertificate.findFirst.mockResolvedValue(null);
    db.parentRelationship.count.mockResolvedValue(0);

    expect(await findUnpublishedEvidence(listing({ publicDataSettingsJson: {} }))).toEqual([]);
  });
});
