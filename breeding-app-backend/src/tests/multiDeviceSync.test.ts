import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two devices and the server, step by step, against the in-memory Prisma.
 *
 * Every case here is a mismatch a keeper actually saw: an animal deleted on the desktop still on
 * the phone, a feed log deleted and back the next morning, a phone's edit lost to the desktop's,
 * a lab result undone by a device that had not synced. The devices stamp their edits with the
 * breeder app's own merge module, so these run the code the app ships, not a restatement of it.
 */

vi.mock("../lib/prisma", async () => {
  const { createInMemoryPrisma } = await import("./support/inMemoryPrisma");
  return { prisma: createInMemoryPrisma() };
});

vi.mock("../services/subscriptionService", () => ({
  canAccessFeature: vi.fn(async () => ({ allowed: true, featureKey: "animals.create", source: "unconfigured", tier: "Unconfigured" })),
}));

vi.mock("../services/reproductiveCycleService", () => ({
  ingestAllPairingsIntoReproductiveCycles: vi.fn(async () => undefined),
}));

vi.mock("../email/queueService", () => ({
  enqueueEmail: vi.fn(async (input: any) => ({ id: `job_${input.idempotencyKey}` })),
  cancelByIdempotencyKey: vi.fn(async () => null),
}));

import { prisma } from "../lib/prisma";
import { listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";
import { logMobileAction } from "../services/mobileService";
import { applyConfirmedResultGenetics } from "../services/labGeneticsService";
// @ts-ignore -- the breeder app's merge module is plain JS; these tests exercise it as shipped.
import { stampRecordChanges, SYNC_ENTRY_ARRAYS } from "../../../breeding-app-breeder/src/services/syncMerge.js";

const db = prisma as any;
const OWNER = "user_keeper";
const actor = { id: OWNER, email: "keeper@example.com", role: "breeder" } as any;
const ANIMAL = { entryArrays: SYNC_ENTRY_ARRAYS.animal, mergeLogs: true };

// What a device holds after reading the server: the record exactly as the snapshot returned it.
const read = async (id = "a1") => {
  const snapshot = await listBreederSnapshot(OWNER);
  return { snapshot, animal: (snapshot.animals as any[]).find((animal) => animal.id === id) };
};

const stored = (id = "a1") => db.$rows("animal").find((row: any) => row.appAnimalId === id);

// Device edits are stamped a little ahead of the server's write times, the way a device edits
// after it read. Real wall-clock time keeps these comparable with the in-memory @updatedAt.
const later = (ms: number) => new Date(Date.now() + ms).toISOString();

beforeEach(() => {
  db.$reset();
});

describe("deletions reach every device", () => {
  it("names a deleted animal in the full snapshot, so a device that was closed learns of it", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", updatedAt: later(0) }] });
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: later(1_000) }] });

    const snapshot = await listBreederSnapshot(OWNER);

    expect(snapshot.animals).toEqual([]);
    expect(Object.keys((snapshot.tombstones as any).animals)).toEqual(["a1"]);
  });

  it("does not let a stale device's copy bring a deleted animal back", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", updatedAt: later(0) }] });
    const { animal: phoneCopy } = await read();
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: later(1_000) }] });

    // The phone never heard about the deletion and re-sends what it held.
    await upsertBreederSnapshot(OWNER, { animals: [phoneCopy] });

    expect(stored().deletedAt).toBeInstanceOf(Date);
    expect((await listBreederSnapshot(OWNER)).animals).toEqual([]);
  });

  it("brings an animal back when a device edited it after the deletion, as that device sent it", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", notes: "old", updatedAt: later(0) }] });
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: later(1_000) }] });

    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena (rehomed back)", updatedAt: later(5_000) }] });

    const { animal } = await read();
    expect(animal.name).toBe("Athena (rehomed back)");
    // Not merged with the dead row's payload.
    expect(animal.notes).toBeUndefined();
  });

  it("reports a deletion made offline, judged by when the server received it", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", updatedAt: "2026-01-01T00:00:00.000Z" }] });
    const cursor = new Date();
    // Deleted on a device hours before it reconnected: the tombstone's own time is old.
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: "2026-01-02T00:00:00.000Z" }] });

    const delta = await listBreederSnapshot(OWNER, { since: new Date(cursor.getTime() - 1) });

    expect((delta.deleted as any).animals).toEqual(["a1"]);
  });

  it("does not report the same deletion again every time a device re-sends its tombstones", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", updatedAt: later(0) }] });
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: later(1_000) }] });
    const firstWrite = stored().updatedAt.getTime();
    const cursor = new Date(Date.now() + 1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: later(1_000) }] });

    expect(stored().updatedAt.getTime()).toBe(firstWrite);
    expect(((await listBreederSnapshot(OWNER, { since: cursor })).deleted as any).animals).toEqual([]);
  });
});

describe("edits on two devices", () => {
  it("keeps both devices' edits when they changed different fields of one animal", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", notes: "", status: "Holdback", updatedAt: later(0) }] });
    const { animal: base } = await read();

    const phone = stampRecordChanges({ ...base, notes: "Refused twice" }, base, { ...ANIMAL, now: later(2_000) });
    const desktop = stampRecordChanges({ ...base, status: "For sale" }, base, { ...ANIMAL, now: later(3_000) });
    await upsertBreederSnapshot(OWNER, { animals: [phone] });
    await upsertBreederSnapshot(OWNER, { animals: [desktop] });

    const { animal } = await read();
    expect(animal.notes).toBe("Refused twice");
    expect(animal.status).toBe("For sale");
  });

  it("keeps a deleted feed log deleted when a device that still has it syncs", async () => {
    await upsertBreederSnapshot(OWNER, {
      animals: [{ id: "a1", name: "Athena", logs: { feeds: [{ id: "f1", date: "2026-09-20" }, { id: "f2", date: "2026-09-27" }] }, updatedAt: later(0) }],
    });
    const { animal: base } = await read();
    const stale = { ...base };

    const edited = stampRecordChanges({ ...base, logs: { ...base.logs, feeds: [base.logs.feeds[1]] } }, base, { ...ANIMAL, now: later(2_000) });
    await upsertBreederSnapshot(OWNER, { animals: [edited] });
    await upsertBreederSnapshot(OWNER, { animals: [stale] });

    const { animal } = await read();
    expect(animal.logs.feeds.map((entry: any) => entry.id)).toEqual(["f2"]);
  });

  it("keeps a phone's quick log when the desktop saves a copy from before it", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", logs: { feeds: [] }, updatedAt: later(0) }] });
    const { animal: desktopCopy } = await read();

    await logMobileAction(actor, "feed", { animalId: "a1", result: "accepted", feed: "rat" });
    const desktopEdit = stampRecordChanges({ ...desktopCopy, notes: "Moved to rack B" }, desktopCopy, { ...ANIMAL, now: later(2_000) });
    await upsertBreederSnapshot(OWNER, { animals: [desktopEdit] });

    const { animal } = await read();
    expect(animal.notes).toBe("Moved to rack B");
    expect(animal.logs.feeds).toHaveLength(1);
    expect(animal.feedingStatus).toBe("fed");
  });

  it("does not let a device that had not synced undo a laboratory result", async () => {
    await upsertBreederSnapshot(OWNER, {
      animals: [{ id: "a1", name: "Athena", morphs: [], hets: [], possibleHets: ["66% poss het Clown"], updatedAt: later(0) }],
    });
    const { animal: staleCopy } = await read();

    await db.$transaction(async (tx: any) => {
      // The ordered test reads Clown; the catalogue lookup is the one thing scripted here.
      const labTx = Object.create(tx);
      labTx.labTestOffering = { findMany: async () => [{ id: "off-1", name: "Clown", geneTarget: "Clown", aliases: [] }] };
      return applyConfirmedResultGenetics(labTx, {
        order: { id: "order-1", breederId: OWNER, animals: [{ animalId: "a1", tests: [{ offeringId: "off-1" }] }] },
        results: [{ id: "result-1", animalId: "a1", findingsJson: [{ marker: "Clown", outcome: "notDetected" }] }],
        actorUserId: "lab-user",
      } as any);
    });
    const afterLab = (await read()).animal;

    // The stale device edits something unrelated and syncs its whole old copy.
    const unrelated = stampRecordChanges({ ...staleCopy, notes: "weighed" }, staleCopy, { ...ANIMAL, now: later(5_000) });
    await upsertBreederSnapshot(OWNER, { animals: [unrelated] });

    const { animal } = await read();
    expect(animal.notes).toBe("weighed");
    expect(animal.possibleHets).toEqual(afterLab.possibleHets);
  });

  // Postgres returns JSON with its own key order. Compared as plain JSON strings, an untouched
  // planner state looked edited on every round trip and the app re-uploaded it about once a
  // second, for as long as it stayed open.
  it("writes nothing when the copy comes back with its keys in a different order", async () => {
    const appearance = { version: 2, preset: "default", motion: { animations: true, reducedMotion: false } };
    await upsertBreederSnapshot(OWNER, { plannerState: { appearance, groups: ["Rack A"], updatedAt: later(0) } });
    const before = db.$rows("breederPlannerState")[0].updatedAt.getTime();
    const echoed = (await listBreederSnapshot(OWNER)).plannerState as any;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await upsertBreederSnapshot(OWNER, {
      plannerState: { ...echoed, appearance: { motion: { reducedMotion: false, animations: true }, preset: "default", version: 2 } },
    });

    expect(db.$rows("breederPlannerState")[0].updatedAt.getTime()).toBe(before);
  });

  it("writes nothing when a device echoes back exactly what it read", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", updatedAt: later(0) }] });
    const { animal } = await read();
    const before = stored().updatedAt.getTime();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await upsertBreederSnapshot(OWNER, { animals: [animal] });

    expect(stored().updatedAt.getTime()).toBe(before);
  });
});

describe("pairings", () => {
  it("lets a deliberate hatchling reset win over the old high-water mark", async () => {
    await upsertBreederSnapshot(OWNER, {
      pairings: [{ id: "p1", label: "A x B", hatch: { hatchlingsGeneratedThrough: 6 }, updatedAt: later(0) }],
    });
    await upsertBreederSnapshot(OWNER, {
      pairings: [{ id: "p1", label: "A x B", hatch: { hatchlingsGeneratedThrough: 0, hatchlingsResetCount: 1 }, updatedAt: later(2_000) }],
    });

    const pairing = ((await listBreederSnapshot(OWNER)).pairings as any[])[0];
    expect(pairing.hatch.hatchlingsGeneratedThrough).toBe(0);
    expect(pairing.hatch.hatchlingsResetCount).toBe(1);
  });
});

describe("quick logs", () => {
  it("does not find a deleted animal by its QR code", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", name: "Athena", updatedAt: later(0) }] });
    await upsertBreederSnapshot(OWNER, { animals: [{ id: "a1", deletedAt: later(1_000) }] });

    await expect(logMobileAction(actor, "feed", { animalId: "a1" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
