import { describe, expect, it } from "vitest";
import * as server from "../services/syncMerge";
// @ts-ignore -- the breeder app's merge module is plain JS, imported as shipped.
import * as client from "../../../breeding-app-breeder/src/services/syncMerge.js";

/**
 * The device and the server merge the same two copies of a record and must reach the same result,
 * or each keeps a different "truth" for one animal: the mismatch this module exists to end. The
 * cases are generated from a fixed seed so a failure always reproduces.
 */

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const TIMES = ["2026-10-01T10:00:00.000Z", "2026-10-01T11:00:00.000Z", "2026-10-01T12:00:00.000Z", undefined];

const makeRecord = (random: () => number) => {
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];
  const record: Record<string, any> = { id: "a1" };
  const updatedAt = pick(TIMES);
  if (updatedAt) record.updatedAt = updatedAt;
  if (random() < 0.8) record.name = pick(["Athena", "Athena II", "Nyx"]);
  if (random() < 0.6) record.morphs = pick([["Pastel"], ["Pastel", "Clown"], []]);
  if (random() < 0.5) record.notes = pick(["", "Refused", null]);
  if (random() < 0.6) {
    record.fieldUpdatedAt = { "*": TIMES[0] };
    if (random() < 0.5) record.fieldUpdatedAt.name = pick(TIMES.slice(0, 3));
    if (random() < 0.5) record.fieldUpdatedAt.notes = pick(TIMES.slice(0, 3));
  }
  if (random() < 0.4) record.removedEntries = { f1: pick(TIMES.slice(0, 3)) };
  if (random() < 0.7) {
    record.logs = {
      feeds: [
        { id: "f1", date: "2026-09-20", feed: "rat" },
        ...(random() < 0.5 ? [{ id: "f2", date: "2026-09-27", feed: pick(["rat", "mouse"]), updatedAt: pick(TIMES.slice(0, 3)) }] : []),
        ...(random() < 0.3 ? [{ date: "2026-09-20", feed: "rat" }] : []),
      ],
    };
  }
  if (random() < 0.5) record.photos = [{ url: "https://cdn/p1.jpg", addedAt: TIMES[0] }];
  // Photos in cloud storage: an entry whose url is a `photo:` reference, sometimes the same entry
  // id as an inline copy on the other side (a device that has not migrated it yet).
  if (random() < 0.5) {
    record.photos = [
      ...(record.photos || []),
      { id: "ph1", url: pick(["photo:abc123", "data:image/jpeg;base64,/9j/AAAA"]), addedAt: TIMES[1], ...(random() < 0.5 ? { photoId: "abc123" } : {}) },
    ];
    if (random() < 0.5) record.imageUrl = pick(["photo:abc123", "photo:def456"]);
  }
  return record;
};

describe("device and server merge identically", () => {
  it("agrees on 500 generated pairs of copies", () => {
    const random = seeded(20261012);
    const options = { entryArrays: ["photos"], mergeLogs: true };
    for (let index = 0; index < 500; index += 1) {
      const existing = makeRecord(random);
      const incoming = makeRecord(random);
      expect(client.mergeSyncRecord(existing, incoming, options), `case ${index}`).toEqual(
        server.mergeSyncRecord(existing, incoming, options),
      );
    }
  });

  it("carries photo references through untouched on both sides", () => {
    const options = { entryArrays: ["photos"], mergeLogs: true };
    const stored = { id: "ph1", url: "photo:abc123", photoId: "abc123", addedAt: TIMES[0] };
    const existing = { id: "a1", updatedAt: TIMES[0], photos: [] };
    const incoming = {
      id: "a1",
      updatedAt: TIMES[1],
      imageUrl: "photo:abc123",
      fieldUpdatedAt: { "*": TIMES[0], imageUrl: TIMES[1] },
      photos: [stored],
    };
    const fromClient = client.mergeSyncRecord(existing, incoming, options);
    const fromServer = server.mergeSyncRecord(existing, incoming, options);
    expect(fromServer).toEqual(fromClient);
    expect(fromServer.imageUrl).toBe("photo:abc123");
    expect(fromServer.photos).toEqual([stored]);
    expect(fromServer.removedEntries).toBeUndefined();
  });

  it("derives the same entry identities and hashes", () => {
    const entry = { date: "2026-09-20", feed: "rat", notes: "ok" };
    expect(client.entryKeys(entry, "feeds")).toEqual(server.entryKeys(entry, "feeds"));
    expect(client.SYNC_ENTRY_ARRAYS).toEqual(server.SYNC_ENTRY_ARRAYS);
  });
});
