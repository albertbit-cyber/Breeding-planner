import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

/**
 * Breeding cards through the cloud sync and the read API (SBR-02, SBR-11, acceptance A/P/Q).
 *
 * Runs against the in-memory Prisma so each step sees what the previous one wrote: a card saved
 * by one device is what the second device's save is judged against.
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

import { app } from "../app";
import { prisma } from "../lib/prisma";
import { enqueueEmail, cancelByIdempotencyKey } from "../email/queueService";
import { signAuthToken } from "../utils/jwt";
import { upsertBreederSnapshot, listBreederSnapshot } from "../services/breederDataService";
import { syncPlannedPairingReminders, resolveActiveCycleConflicts } from "../services/breedingCycleSyncService";

const db = prisma as any;
const rows = (delegate: string): any[] => db.$rows(delegate);

const OWNER_A = "user_a";
const OWNER_B = "user_b";
const token = (sub: string) => signAuthToken({ sub, email: `${sub}@example.com`, role: "breeder", persistedRole: "breeder", portal: "breeder" });

const femaleCard = (overrides: Record<string, unknown> = {}) => ({
  id: "bc-1",
  femaleId: "F1",
  seasonLabel: "2026–27",
  startDate: "2026-03-01",
  status: "active",
  multipleSires: false,
  males: [{ maleId: "M1", state: "participated" }],
  sessions: [{ id: "s1", maleId: "M1", introductionDate: "2026-03-01", locks: [{ id: "l1", observationDate: "2026-03-01", status: "observed" }] }],
  plannedPairings: [{ id: "pp1", maleId: "M1", date: "2099-04-01", status: "pending", origin: "auto_after_lock" }],
  events: [],
  clutch: {},
  offspring: [],
  updatedAt: "2026-03-01T10:00:00.000Z",
  ...overrides,
});

const seed = () => {
  db.$reset();
  rows("user").push(
    { id: OWNER_A, email: "a@example.com", fullName: "A", role: "breeder", status: "active", isActive: true, emailVerified: true, passwordHash: "x" },
    { id: OWNER_B, email: "b@example.com", fullName: "B", role: "breeder", status: "active", isActive: true, emailVerified: true, passwordHash: "x" },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe("breeding cards in the cloud sync", () => {
  it("stores a card and an examination for the owner and returns them in the snapshot", async () => {
    const exam = { id: "fx-1", femaleId: "F1", date: "2026-01-15", method: "ultrasound", result: "follicles_seen", largestDiameterMm: 14, updatedAt: "2026-01-15T10:00:00.000Z" };
    const { changed } = await upsertBreederSnapshot(OWNER_A, {
      animals: [{ id: "F1", name: "Athena", sex: "F" }, { id: "M1", name: "Zeus", sex: "M" }],
      breedingCycles: [femaleCard()],
      follicleExams: [exam],
    });
    expect(changed.breedingCycles).toHaveLength(1);
    expect(changed.follicleExams).toHaveLength(1);
    const stored = rows("breedingCycle")[0];
    expect(stored).toMatchObject({ ownerId: OWNER_A, appCycleId: "bc-1", femaleAnimalAppId: "F1", status: "active", startDate: "2026-03-01", seasonLabel: "2026–27" });
    expect(rows("follicleExamination")[0]).toMatchObject({ ownerId: OWNER_A, appExamId: "fx-1", femaleAnimalAppId: "F1", examDate: "2026-01-15", largestDiameterMm: 14 });
    const snapshot = await listBreederSnapshot(OWNER_A);
    expect((snapshot.breedingCycles as any[]).map((c) => c.id)).toEqual(["bc-1"]);
    expect((snapshot.follicleExams as any[]).map((c) => c.id)).toEqual(["fx-1"]);
  });

  it("is idempotent: saving the same card again creates nothing new and keeps one lock", async () => {
    const animals = [{ id: "F1", sex: "F" }, { id: "M1", sex: "M" }];
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [femaleCard()] });
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [femaleCard({ updatedAt: "2026-03-01T11:00:00.000Z" })] });
    expect(rows("breedingCycle")).toHaveLength(1);
    expect(rows("breedingCycle")[0].payload.sessions[0].locks).toHaveLength(1);
  });

  it("merges nested entries from two devices by id instead of dropping one side", async () => {
    const animals = [{ id: "F1", sex: "F" }, { id: "M1", sex: "M" }, { id: "M2", sex: "M" }];
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [femaleCard()] });
    // A real device stamps the save time; the stored row's updatedAt is compared against it.
    const otherDevice = femaleCard({
      updatedAt: new Date(Date.now() + 1000).toISOString(),
      males: [{ maleId: "M1", state: "participated" }, { maleId: "M2", state: "participated" }],
      sessions: [
        { id: "s1", maleId: "M1", introductionDate: "2026-03-01", locks: [{ id: "l1", observationDate: "2026-03-01", status: "observed" }, { id: "l2", observationDate: "2026-03-02", status: "observed" }] },
        { id: "s2", maleId: "M2", introductionDate: "2026-03-02", locks: [] },
      ],
    });
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [otherDevice] });
    const payload = rows("breedingCycle")[0].payload;
    expect(payload.sessions.map((s: any) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(payload.sessions.find((s: any) => s.id === "s1").locks).toHaveLength(2);
    expect(payload.males).toHaveLength(2);
  });

  it("pauses a second active card for the same female and flags it for review instead of failing", async () => {
    const animals = [{ id: "F1", sex: "F" }, { id: "M1", sex: "M" }];
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [femaleCard()] });
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [femaleCard({ id: "bc-2", startDate: "2026-03-05", sessions: [{ id: "s9", maleId: "M1", introductionDate: "2026-03-05", locks: [] }], plannedPairings: [] })] });
    const stored = rows("breedingCycle");
    expect(stored).toHaveLength(2);
    expect(stored.find((c: any) => c.appCycleId === "bc-1").status).toBe("active");
    const duplicate = stored.find((c: any) => c.appCycleId === "bc-2");
    expect(duplicate.status).toBe("paused");
    expect(duplicate.payload.reviewFlags[0]).toMatchObject({ kind: "duplicate_active_cycle", keptCycleId: "bc-1" });
    expect(duplicate.payload.sessions).toHaveLength(1); // nothing merged, nothing lost
  });

  it("resolves conflicts deterministically with the earliest start kept active", () => {
    const changes = resolveActiveCycleConflicts([
      { id: "late", femaleId: "F1", status: "active", startDate: "2026-04-01" },
      { id: "early", femaleId: "F1", status: "active", startDate: "2026-03-01" },
      { id: "other", femaleId: "F2", status: "active", startDate: "2026-03-01" },
    ]);
    expect(Array.from(changes.keys())).toEqual(["late"]);
    expect(changes.get("late")).toMatchObject({ status: "paused" });
  });

  // One card naming a male the server never had used to reject the whole save with a 400, so that
  // device could not sync anything at all. The card now saves with a review flag, a malformed
  // record is left out on its own, and the rest of the save goes through.
  it("keeps a card that names an unknown animal, flagged for review, without blocking the save", async () => {
    await upsertBreederSnapshot(OWNER_B, { animals: [{ id: "FB", sex: "F" }] });
    const { changed } = await upsertBreederSnapshot(OWNER_A, {
      animals: [{ id: "F1", sex: "F" }, { id: "M1", sex: "M" }],
      breedingCycles: [femaleCard({ males: [{ maleId: "MX" }] })],
      follicleExams: [{ id: "fx-x", femaleId: "F1", date: "2026-01-01", method: "external", largestDiameterMm: 20 }],
    });

    // The animals in the same save were stored.
    expect(rows("animal").filter((row) => row.ownerId === OWNER_A).map((row) => row.appAnimalId).sort()).toEqual(["F1", "M1"]);
    // The card was stored, with the unknown male named in an open review flag.
    const card = rows("breedingCycle").find((row) => row.ownerId === OWNER_A);
    expect(card.payload.reviewFlags).toEqual([
      expect.objectContaining({ kind: "unresolved_animal_reference", animalIds: ["MX"] }),
    ]);
    // The malformed examination alone was left out, and the response says so.
    expect(rows("follicleExamination").filter((row) => row.ownerId === OWNER_A)).toHaveLength(0);
    expect((changed as any).skipped).toEqual([
      expect.objectContaining({ collection: "follicleExams", id: "fx-x" }),
    ]);

    // Once the male arrives, the flag clears itself.
    await upsertBreederSnapshot(OWNER_A, {
      animals: [{ id: "MX", sex: "M" }],
      breedingCycles: [femaleCard({ males: [{ maleId: "MX" }], updatedAt: "2026-05-03T10:00:00.000Z" })],
    });
    const resolved = rows("breedingCycle").find((row) => row.ownerId === OWNER_A);
    expect(resolved.payload.reviewFlags || []).toEqual([]);
  });

  it("leaves the unknown-animal flag reviewed once the keeper has marked it", async () => {
    await upsertBreederSnapshot(OWNER_A, { animals: [{ id: "F1", sex: "F" }], breedingCycles: [femaleCard({ males: [{ maleId: "MX" }] })] });
    const flag = rows("breedingCycle")[0].payload.reviewFlags[0];
    await upsertBreederSnapshot(OWNER_A, {
      breedingCycles: [femaleCard({ males: [{ maleId: "MX" }], reviewFlags: [{ ...flag, resolvedAt: "2026-10-13T09:00:00.000Z" }], updatedAt: "2099-01-01T00:00:00.000Z" })],
    });
    const flags = rows("breedingCycle")[0].payload.reviewFlags;
    expect(flags).toHaveLength(1);
    expect(flags[0].resolvedAt).toBe("2026-10-13T09:00:00.000Z");
  });

  it("never lets a card reach an animal of another account", async () => {
    await upsertBreederSnapshot(OWNER_B, { animals: [{ id: "FB", sex: "F" }] });
    await upsertBreederSnapshot(OWNER_A, {
      animals: [{ id: "F1", sex: "F" }],
      breedingCycles: [femaleCard({ id: "bc-x", femaleId: "FB", males: [], sessions: [], plannedPairings: [] })],
    });
    // Owner B's animal is untouched and owner A's card names an id that resolves to nothing there.
    const card = rows("breedingCycle").find((row) => row.ownerId === OWNER_A);
    expect(card.payload.reviewFlags).toEqual([expect.objectContaining({ animalIds: ["FB"] })]);
    expect(rows("breedingCycle").filter((row) => row.ownerId === OWNER_B)).toHaveLength(0);
  });

  it("keeps history for an archived (deleted) animal and honours tombstones", async () => {
    const animals = [{ id: "F1", sex: "F" }, { id: "M1", sex: "M" }];
    await upsertBreederSnapshot(OWNER_A, { animals, breedingCycles: [femaleCard()] });
    await upsertBreederSnapshot(OWNER_A, { animals: [{ id: "M1", deletedAt: "2026-05-01T00:00:00.000Z" }] });
    // The male is archived; the card that names him still saves.
    await upsertBreederSnapshot(OWNER_A, { breedingCycles: [femaleCard({ updatedAt: "2026-05-02T10:00:00.000Z" })] });
    expect(rows("breedingCycle")[0].deletedAt ?? null).toBeNull();
    await upsertBreederSnapshot(OWNER_A, { breedingCycles: [{ id: "bc-1", deletedAt: "2026-06-01T00:00:00.000Z" }] });
    expect(rows("breedingCycle")[0].deletedAt).toBeInstanceOf(Date);
    const since = await listBreederSnapshot(OWNER_A, { since: new Date("2026-05-15T00:00:00.000Z") });
    expect((since.deleted as any).breedingCycles).toEqual(["bc-1"]);
  });

  it("queues one reminder per pending planned pairing and withdraws it when the entry is resolved", async () => {
    const names = new Map([["F1", "Athena"], ["M1", "Zeus"]]);
    const card = femaleCard();
    let result = await syncPlannedPairingReminders(OWNER_A, [card], names, { today: "2026-03-01" });
    expect(result.queued).toBe(1);
    expect(vi.mocked(enqueueEmail).mock.calls[0][0]).toMatchObject({ idempotencyKey: "breeding_reminder:bc-1:planned_pairing:pp1", templatePayload: { reminderType: "pairing_follow_up", animalDisplayName: "Athena" } });
    result = await syncPlannedPairingReminders(OWNER_A, [card], names, { today: "2026-03-01" });
    expect(result.queued).toBe(1); // same key again: enqueueEmail is idempotent on it
    const skipped = { ...card, plannedPairings: [{ ...card.plannedPairings[0], status: "skipped" }] };
    result = await syncPlannedPairingReminders(OWNER_A, [skipped], names, { today: "2026-03-01" });
    expect(result.cancelled).toBe(1);
    expect(vi.mocked(cancelByIdempotencyKey)).toHaveBeenCalledWith("breeding_reminder:bc-1:planned_pairing:pp1");
    const paused = { ...card, status: "paused" };
    result = await syncPlannedPairingReminders(OWNER_A, [paused], names, { today: "2026-03-01" });
    expect(result.queued).toBe(0);
    const past = { ...card, plannedPairings: [{ ...card.plannedPairings[0], date: "2025-01-01" }] };
    result = await syncPlannedPairingReminders(OWNER_A, [past], names, { today: "2026-03-01" });
    expect(result.queued).toBe(0); // backfilled history does not fire past-due mail
  });
});

describe("breeding read API", () => {
  beforeEach(async () => {
    await upsertBreederSnapshot(OWNER_A, {
      animals: [{ id: "F1", name: "Athena", sex: "F" }, { id: "M1", name: "Zeus", sex: "M" }],
      breedingCycles: [femaleCard({ events: [{ id: "ev1", type: "ovulation", date: "2026-04-20", certainty: "recorded" }] })],
      follicleExams: [{ id: "fx-1", femaleId: "F1", date: "2026-02-10", method: "ultrasound", result: "follicles_seen", largestDiameterMm: 21, nextReviewDate: "2026-02-24" }],
    });
  });

  it("returns the owner's cycles, exams and overview rows", async () => {
    const cycles = await request(app).get("/api/breeding/cycles?femaleAppId=F1").set("Authorization", `Bearer ${token(OWNER_A)}`);
    expect(cycles.status).toBe(200);
    expect(cycles.body.cycles.map((c: any) => c.id)).toEqual(["bc-1"]);
    const overview = await request(app).get("/api/breeding/overview").set("Authorization", `Bearer ${token(OWNER_A)}`);
    expect(overview.status).toBe(200);
    expect(overview.body.rows[0]).toMatchObject({
      cycleId: "bc-1",
      femaleAppId: "F1",
      sessionCount: 1,
      observedLockCount: 1,
      latestObservedLockDate: "2026-03-01",
      nextPlannedPairing: { date: "2099-04-01", maleAppId: "M1" },
      latestExam: { date: "2026-02-10", largestDiameterMm: 21, isEstimate: false },
      nextReviewDate: "2026-02-24",
      milestones: { ovulation: "2026-04-20" },
    });
  });

  it("never shows another account's records (acceptance Q)", async () => {
    const cycles = await request(app).get("/api/breeding/cycles").set("Authorization", `Bearer ${token(OWNER_B)}`);
    expect(cycles.status).toBe(200);
    expect(cycles.body.cycles).toEqual([]);
    const exams = await request(app).get("/api/breeding/follicle-exams?femaleAppId=F1").set("Authorization", `Bearer ${token(OWNER_B)}`);
    expect(exams.body.exams).toEqual([]);
    const overview = await request(app).get("/api/breeding/overview").set("Authorization", `Bearer ${token(OWNER_B)}`);
    expect(overview.body.rows).toEqual([]);
    const anonymous = await request(app).get("/api/breeding/overview");
    expect(anonymous.status).toBe(401);
  });
});
