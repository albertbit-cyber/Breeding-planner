import { afterEach, describe, expect, it } from "vitest";
import {
  SYNC_ENTRY_ARRAYS,
  entryKeys,
  fieldTime,
  mergeSyncRecord,
  noteServerTime,
  sameSyncContent,
  setServerClockOffsetMs,
  stampRecordChanges,
  syncNow,
} from "./syncMerge";

const ANIMAL = { entryArrays: SYNC_ENTRY_ARRAYS.animal, mergeLogs: true };
const PAIRING = { entryArrays: SYNC_ENTRY_ARRAYS.pairing, mergeLogs: true };

const T0 = "2026-10-01T10:00:00.000Z";
const T1 = "2026-10-01T11:00:00.000Z";
const T2 = "2026-10-01T12:00:00.000Z";
const T3 = "2026-10-01T13:00:00.000Z";

// The copy both devices started from, as the server last returned it.
const synced = () => ({
  id: "a1",
  name: "Athena",
  sex: "F",
  notes: "",
  status: "Holdback",
  morphs: ["Pastel", "Clown"],
  tags: ["keeper"],
  photos: [{ id: "p1", url: "https://cdn/p1.jpg", addedAt: T0 }],
  logs: {
    // Newest first, the order synced logs are stored in.
    feeds: [{ id: "f2", date: "2026-09-27", feed: "rat" }, { id: "f1", date: "2026-09-20", feed: "rat" }],
    weights: [],
  },
  updatedAt: T0,
});

describe("two devices editing one animal", () => {
  it("keeps both edits when they touched different fields", () => {
    const base = synced();
    const phone = stampRecordChanges({ ...base, notes: "Refused twice" }, base, { ...ANIMAL, now: T1 });
    const desktop = stampRecordChanges({ ...base, status: "For sale" }, base, { ...ANIMAL, now: T2 });

    // The phone syncs first; then the desktop's copy meets the server's.
    const server = mergeSyncRecord(base, phone, ANIMAL);
    const result = mergeSyncRecord(server, desktop, ANIMAL);

    expect(result.notes).toBe("Refused twice");
    expect(result.status).toBe("For sale");
  });

  it("gives a field to the later edit regardless of which device syncs last", () => {
    const base = synced();
    const later = stampRecordChanges({ ...base, name: "Athena II" }, base, { ...ANIMAL, now: T2 });
    const earlier = stampRecordChanges({ ...base, name: "Athena I" }, base, { ...ANIMAL, now: T1 });

    const laterFirst = mergeSyncRecord(mergeSyncRecord(base, later, ANIMAL), earlier, ANIMAL);
    const earlierFirst = mergeSyncRecord(mergeSyncRecord(base, earlier, ANIMAL), later, ANIMAL);

    expect(laterFirst.name).toBe("Athena II");
    expect(earlierFirst.name).toBe("Athena II");
  });

  it("does not let a stale copy echoed back undo a deleted gene", () => {
    const base = synced();
    const edited = stampRecordChanges({ ...base, morphs: ["Clown"] }, base, { ...ANIMAL, now: T1 });
    const server = mergeSyncRecord(base, edited, ANIMAL);

    // A device that never saw the edit sends its old copy back unchanged.
    const result = mergeSyncRecord(server, base, ANIMAL);

    expect(result.morphs).toEqual(["Clown"]);
  });

  it("lets a removed tag stay removed", () => {
    const base = synced();
    const edited = stampRecordChanges({ ...base, tags: [] }, base, { ...ANIMAL, now: T1 });
    const server = mergeSyncRecord(base, edited, ANIMAL);
    expect(mergeSyncRecord(server, base, ANIMAL).tags).toEqual([]);
  });

  it("treats an unchanged echo as no change at all", () => {
    const base = synced();
    expect(sameSyncContent(mergeSyncRecord(base, { ...base }, ANIMAL), base)).toBe(true);
  });
});

describe("deleting entries in nested lists", () => {
  it("keeps a deleted feed log deleted when the other copy still has it", () => {
    const base = synced();
    const removedLog = { ...base, logs: { ...base.logs, feeds: [base.logs.feeds.find(entry => entry.id === "f2")] } };
    const edited = stampRecordChanges(removedLog, base, { ...ANIMAL, now: T1 });

    expect(edited.removedEntries).toHaveProperty("f1");
    const server = mergeSyncRecord(base, edited, ANIMAL);
    const result = mergeSyncRecord(server, base, ANIMAL);

    expect(result.logs.feeds.map(entry => entry.id)).toEqual(["f2"]);
  });

  it("still keeps a feed log the other device added meanwhile", () => {
    const base = synced();
    const deleter = stampRecordChanges({ ...base, logs: { ...base.logs, feeds: [base.logs.feeds.find(entry => entry.id === "f2")] } }, base, { ...ANIMAL, now: T1 });
    const adder = stampRecordChanges(
      { ...base, logs: { ...base.logs, feeds: [...base.logs.feeds, { id: "f3", date: "2026-10-04", feed: "rat", createdAt: T2 }] } },
      base,
      { ...ANIMAL, now: T2 },
    );

    const result = mergeSyncRecord(mergeSyncRecord(base, deleter, ANIMAL), adder, ANIMAL);

    expect(result.logs.feeds.map(entry => entry.id).sort()).toEqual(["f2", "f3"]);
  });

  it("matches a removal to an id-less copy of the same reading", () => {
    // One device backfilled the id from the content; the server still holds the bare entry.
    const bare = { date: "2026-09-20", feed: "rat" };
    const [contentKey] = entryKeys(bare, "feeds").slice(-1);
    const withId = { ...bare, id: contentKey };
    const server = { id: "a1", logs: { feeds: [bare] }, updatedAt: T0 };
    const device = { id: "a1", logs: { feeds: [] }, removedEntries: { [withId.id]: T1 }, updatedAt: T1 };

    expect(mergeSyncRecord(server, device, ANIMAL).logs.feeds).toEqual([]);
  });

  it("removes a photo and a pairing lock for good", () => {
    const base = synced();
    const noPhoto = stampRecordChanges({ ...base, photos: [] }, base, { ...ANIMAL, now: T1 });
    expect(mergeSyncRecord(mergeSyncRecord(base, noPhoto, ANIMAL), base, ANIMAL).photos).toEqual([]);

    const pairing = { id: "pr1", locks: [{ id: "l1", date: "2026-09-01" }, { id: "l2", date: "2026-09-08" }], updatedAt: T0 };
    const noLock = stampRecordChanges({ ...pairing, locks: [pairing.locks[1]] }, pairing, { ...PAIRING, now: T1 });
    const result = mergeSyncRecord(mergeSyncRecord(pairing, noLock, PAIRING), pairing, PAIRING);
    expect(result.locks.map(lock => lock.id)).toEqual(["l2"]);
  });

  it("takes the edited copy of an entry over the older one", () => {
    const base = synced();
    const edited = stampRecordChanges(
      { ...base, logs: { ...base.logs, feeds: [{ ...base.logs.feeds.find(entry => entry.id === "f1"), feed: "mouse" }, base.logs.feeds.find(entry => entry.id === "f2")] } },
      base,
      { ...ANIMAL, now: T1 },
    );
    const result = mergeSyncRecord(mergeSyncRecord(base, edited, ANIMAL), base, ANIMAL);
    expect(result.logs.feeds.find(entry => entry.id === "f1").feed).toBe("mouse");
  });
});

describe("stamping", () => {
  it("returns the record untouched when nothing changed", () => {
    const base = synced();
    expect(stampRecordChanges({ ...base }, base, { ...ANIMAL, now: T1 })).toEqual(base);
  });

  it("stamps only the changed field and remembers when the rest was last known good", () => {
    const base = synced();
    const edited = stampRecordChanges({ ...base, notes: "x" }, base, { ...ANIMAL, now: T1 });
    expect(edited.fieldUpdatedAt).toEqual({ "*": T0, notes: T1 });
    expect(fieldTime(edited, "notes")).toBe(new Date(T1).getTime());
    expect(fieldTime(edited, "name")).toBe(new Date(T0).getTime());
  });

  it("stamps a record whose only change is an edited photo", () => {
    const base = synced();
    const edited = stampRecordChanges({ ...base, photos: [{ ...base.photos[0], caption: "Shed" }] }, base, { ...ANIMAL, now: T1 });
    expect(edited.photos[0].updatedAt).toBe(T1);
    expect(edited.updatedAt).toBe(T1);
  });

  it("keeps the record's edit time when the sync path re-stamps an already stamped edit", () => {
    const base = synced();
    const atEdit = stampRecordChanges({ ...base, notes: "x" }, base, { ...ANIMAL, now: T1 });
    expect(stampRecordChanges(atEdit, base, { ...ANIMAL, now: T3 }).updatedAt).toBe(T1);
  });

  it("keeps the edit time of a field the record already stamped", () => {
    const base = synced();
    const atEdit = stampRecordChanges({ ...base, notes: "x" }, base, { ...ANIMAL, now: T1 });
    // The sync path stamps again later against the older baseline.
    const atSync = stampRecordChanges(atEdit, base, { ...ANIMAL, now: T3 });
    expect(atSync.fieldUpdatedAt.notes).toBe(T1);
  });

  it("propagates a field that was removed on purpose", () => {
    const base = { ...synced(), labGeneticsConfirmation: { decisions: [] } };
    const { labGeneticsConfirmation, ...cleared } = base;
    const edited = stampRecordChanges(cleared, base, { ...ANIMAL, now: T1 });
    expect(mergeSyncRecord(base, edited, ANIMAL)).not.toHaveProperty("labGeneticsConfirmation");
    // A copy that simply never carried the field does not remove it.
    const { labGeneticsConfirmation: _unused, ...partial } = synced();
    expect(mergeSyncRecord(base, { ...partial, updatedAt: T2 }, ANIMAL)).toHaveProperty("labGeneticsConfirmation");
  });
});

describe("the sync clock", () => {
  afterEach(() => setServerClockOffsetMs(0));

  it("corrects for a device clock that runs behind the server's", () => {
    const started = Date.now();
    noteServerTime(new Date(started + 120_000).toISOString(), started, started);
    expect(new Date(syncNow()).getTime() - Date.now()).toBeGreaterThan(110_000);
  });
});
