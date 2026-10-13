import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Full replace from a backup file, against the in-memory Prisma: the file becomes the account, a
 * device holding the old data cannot merge it back, and the replace can be undone.
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
import { canAccessFeature } from "../services/subscriptionService";
import { DATA_REPLACED_CODE, listBreederSnapshot, upsertBreederSnapshot } from "../services/breederDataService";
import {
  REPLACEMENT_HISTORY_LIMIT,
  listBreederDataReplacements,
  replaceBreederData,
  undoBreederDataReplacement,
} from "../services/breederDataReplaceService";

const db = prisma as any;
const OWNER = "user_keeper";
const OTHER = "user_other";
const EARLY = "2026-08-01T10:00:00.000Z";

const animal = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Snake ${id}`, sex: "F", updatedAt: EARLY, ...extra });
const ids = (records: any[]) => records.map((record) => record.id).sort();

const seedUser = async (id: string) => {
  await db.user.create({ data: { id, email: `${id}@example.com`, passwordHash: "x", role: "breeder" } });
};

beforeEach(async () => {
  db.$reset();
  vi.mocked(canAccessFeature).mockResolvedValue({ allowed: true, featureKey: "animals.create", source: "unconfigured", tier: "Unconfigured" } as any);
  await seedUser(OWNER);
  await seedUser(OTHER);
  // What the cloud holds before the replace: three animals and a pairing, synced the normal way.
  await upsertBreederSnapshot(OWNER, {
    animals: [animal("a1"), animal("a2"), animal("a3", { name: "Only in the cloud" })],
    pairings: [{ id: "p1", maleId: "a1", femaleId: "a2", updatedAt: EARLY }],
    plannerState: { groups: ["Cloud group"], updatedAt: EARLY },
  });
});

const backupFile = () => ({
  animals: [
    animal("a1", { name: "From the file" }),
    animal("a4"),
    // Two hundred copies of one reading under different ids, as the old backfill bug left them.
    animal("a2", {
      logs: {
        weights: Array.from({ length: 200 }, (_, index) => ({ id: `w-${String(index).padStart(3, "0")}`, date: "2025-11-29", weight: 812 })),
        feeds: [{ id: "f-1", date: "2025-11-30", prey: "rat" }],
      },
    }),
  ],
  pairings: [{ id: "p2", maleId: "a1", femaleId: "a2", updatedAt: EARLY }],
  plannerState: { groups: ["File group"], updatedAt: EARLY },
});

describe("replaceBreederData", () => {
  it("previews without writing anything", async () => {
    const result = await replaceBreederData(OWNER, backupFile(), { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.before.animals).toBe(3);
    expect(result.after.animals).toBe(3);
    // a3 is in the cloud but not in the file, p1 likewise.
    expect(result.removed.animals).toBe(1);
    expect(result.removed.pairings).toBe(1);
    expect(result.duplicateLogEntriesRemoved).toBe(199);

    const snapshot = await listBreederSnapshot(OWNER);
    expect(ids(snapshot.animals as any[])).toEqual(["a1", "a2", "a3"]);
    expect(snapshot.dataGeneration).toBe(0);
  });

  it("makes the file the whole account and tells every device through the generation", async () => {
    const result = await replaceBreederData(OWNER, backupFile());
    expect(result.dataGeneration).toBe(1);

    const snapshot = await listBreederSnapshot(OWNER);
    expect(ids(snapshot.animals as any[])).toEqual(["a1", "a2", "a4"]);
    expect(ids(snapshot.pairings as any[])).toEqual(["p2"]);
    expect(snapshot.dataGeneration).toBe(1);
    // What the file left out is deleted, not just hidden: devices learn it as a tombstone.
    expect(Object.keys((snapshot.tombstones as any).animals)).toEqual(["a3"]);
    expect(Object.keys((snapshot.tombstones as any).pairings)).toEqual(["p1"]);
    // The file's values win outright, not merged with the cloud's.
    const a1 = (snapshot.animals as any[]).find((record) => record.id === "a1");
    expect(a1.name).toBe("From the file");
    expect((snapshot.plannerState as any).groups).toEqual(["File group"]);
  });

  it("collapses duplicated log entries and stamps every record with the replace time", async () => {
    const result = await replaceBreederData(OWNER, backupFile());
    const snapshot = await listBreederSnapshot(OWNER);
    const a2 = (snapshot.animals as any[]).find((record) => record.id === "a2");

    expect(a2.logs.weights).toHaveLength(1);
    expect(a2.logs.weights[0].id).toBe("w-000");
    expect(a2.logs.feeds).toHaveLength(1);
    // A device's August copy of any field now loses the field merge to the replace.
    expect(a2.fieldUpdatedAt).toEqual({ "*": result.replacedAt });
  });

  it("turns away a save from a device that has not loaded the replace", async () => {
    await replaceBreederData(OWNER, backupFile());

    // A device that still holds a3 and has never heard of generation 1 (or a build that predates it).
    const stale = upsertBreederSnapshot(OWNER, { animals: [animal("a3", { updatedAt: new Date().toISOString() })] });
    await expect(stale).rejects.toMatchObject({ statusCode: 409, details: { code: DATA_REPLACED_CODE, dataGeneration: 1 } });
    const olderGeneration = upsertBreederSnapshot(OWNER, { animals: [animal("a3")], dataGeneration: 0 });
    await expect(olderGeneration).rejects.toMatchObject({ statusCode: 409 });

    const snapshot = await listBreederSnapshot(OWNER);
    expect(ids(snapshot.animals as any[])).toEqual(["a1", "a2", "a4"]);

    // A device that reloaded saves normally.
    await upsertBreederSnapshot(OWNER, { animals: [animal("a5", { updatedAt: new Date().toISOString() })], dataGeneration: 1 });
    expect(ids((await listBreederSnapshot(OWNER)).animals as any[])).toEqual(["a1", "a2", "a4", "a5"]);
  });

  it("leaves accounts that were never replaced exactly as before", async () => {
    await upsertBreederSnapshot(OWNER, { animals: [animal("a9", { updatedAt: new Date().toISOString() })] });
    const snapshot = await listBreederSnapshot(OWNER);
    expect(snapshot.dataGeneration).toBe(0);
    expect(ids(snapshot.animals as any[])).toContain("a9");
  });

  it("refuses a file with no animals and no pairings", async () => {
    await expect(replaceBreederData(OWNER, { animals: [], pairings: [] })).rejects.toMatchObject({ statusCode: 400 });
    expect(ids((await listBreederSnapshot(OWNER)).animals as any[])).toEqual(["a1", "a2", "a3"]);
  });

  it("refuses a file larger than the tier allows, before writing", async () => {
    vi.mocked(canAccessFeature).mockResolvedValue({ allowed: true, limit: 2, tier: "Starter" } as any);
    await expect(replaceBreederData(OWNER, backupFile())).rejects.toMatchObject({ statusCode: 403 });
    expect((await listBreederSnapshot(OWNER)).dataGeneration).toBe(0);
  });

  it("touches only the account that asked", async () => {
    await upsertBreederSnapshot(OTHER, { animals: [animal("x1")] });
    await replaceBreederData(OWNER, backupFile());
    const other = await listBreederSnapshot(OTHER);
    expect(ids(other.animals as any[])).toEqual(["x1"]);
    expect(other.dataGeneration).toBe(0);
  });
});

describe("undoBreederDataReplacement", () => {
  it("puts the account back as it was before the replace, under a new generation", async () => {
    const replaced = await replaceBreederData(OWNER, backupFile());
    const undone = await undoBreederDataReplacement(OWNER, replaced.replacementId!);

    expect(undone.dataGeneration).toBe(2);
    const snapshot = await listBreederSnapshot(OWNER);
    expect(ids(snapshot.animals as any[])).toEqual(["a1", "a2", "a3"]);
    expect(ids(snapshot.pairings as any[])).toEqual(["p1"]);
    expect((snapshot.animals as any[]).find((record) => record.id === "a1").name).toBe("Snake a1");
    expect((snapshot.plannerState as any).groups).toEqual(["Cloud group"]);

    // The undo is itself in the history, so it can be undone too.
    const history = await listBreederDataReplacements(OWNER);
    expect(history.map((entry: any) => entry.reason)).toEqual(["undo", "replace"]);
  });

  it("cannot undo another account's replace", async () => {
    const replaced = await replaceBreederData(OWNER, backupFile());
    await expect(undoBreederDataReplacement(OTHER, replaced.replacementId!)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("keeps only the most recent replaces", async () => {
    for (let index = 0; index < REPLACEMENT_HISTORY_LIMIT + 2; index += 1) {
      await replaceBreederData(OWNER, backupFile());
    }
    expect(await listBreederDataReplacements(OWNER)).toHaveLength(REPLACEMENT_HISTORY_LIMIT);
    expect(await db.breederDataReplacement.count({ where: { ownerId: OWNER } })).toBe(REPLACEMENT_HISTORY_LIMIT);
  });
});
