import { describe, expect, it } from "vitest";
import {
  applyChangedRecords,
  applyRemoteDeletions,
  backfillLogIds,
  selectRecordsToUpload,
} from "./cloudSyncPayload";

describe("backfillLogIds", () => {
  // The regression that mattered: this used to assign crypto.randomUUID(). It runs on every merge,
  // and the backend keeps id-less entries keyed by their content, so each sync minted another
  // "distinct" copy of the same reading. One account reached 222,517 weight entries for 116 real
  // readings. A random id here fails this test on the second call.
  it("gives the same entry the same id every time it runs", () => {
    const logs = { weights: [{ date: "2025-11-29", grams: 1550, notes: "" }] };

    const first = backfillLogIds(logs);
    const second = backfillLogIds(logs);
    const afterRoundTrip = backfillLogIds(first);

    expect(first.weights[0].id).toBe(second.weights[0].id);
    expect(afterRoundTrip.weights[0].id).toBe(first.weights[0].id);
  });

  it("keeps ids that already exist", () => {
    const logs = { weights: [{ id: "log-existing", date: "2025-11-29", grams: 1550 }] };
    expect(backfillLogIds(logs).weights[0].id).toBe("log-existing");
  });

  it("distinguishes entries that differ in any recorded field", () => {
    const logs = {
      weights: [
        { date: "2025-11-29", grams: 1550 },
        { date: "2025-11-29", grams: 1602 },
        { date: "2025-12-06", grams: 1550 },
      ],
    };
    const ids = backfillLogIds(logs).weights.map(entry => entry.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("leaves non-array log buckets alone", () => {
    expect(backfillLogIds({ weights: null }).weights).toBeNull();
  });
});

describe("selectRecordsToUpload", () => {
  it("sends records the server does not have", () => {
    const merged = [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }];
    expect(selectRecordsToUpload(merged, [])).toHaveLength(1);
  });

  it("skips records the server already has at the same version", () => {
    const record = { id: "a", updatedAt: "2026-01-01T00:00:00.000Z" };
    expect(selectRecordsToUpload([record], [record])).toEqual([]);
  });

  it("sends records that are locally newer", () => {
    const merged = [{ id: "a", updatedAt: "2026-02-01T00:00:00.000Z" }];
    const remote = [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }];
    expect(selectRecordsToUpload(merged, remote)).toHaveLength(1);
  });

  it("does not send a record the server holds a newer copy of", () => {
    const merged = [{ id: "a", updatedAt: "2026-01-01T00:00:00.000Z" }];
    const remote = [{ id: "a", updatedAt: "2026-02-01T00:00:00.000Z" }];
    expect(selectRecordsToUpload(merged, remote)).toEqual([]);
  });

  it("sends anything without an id rather than risk dropping it", () => {
    expect(selectRecordsToUpload([{ name: "no id" }], [])).toHaveLength(1);
  });
});

describe("applyRemoteDeletions", () => {
  it("removes records the backend reported as deleted in the window", () => {
    const snapshot = { snakes: [{ id: "a" }, { id: "b" }], pairings: [{ id: "p" }] };
    const result = applyRemoteDeletions(snapshot, { animals: ["a"], pairings: ["p"] });
    expect(result.snakes).toEqual([{ id: "b" }]);
    expect(result.pairings).toEqual([]);
  });

  it("is a no-op for a full snapshot, which conveys deletion by omission", () => {
    const snapshot = { snakes: [{ id: "a" }], pairings: [] };
    expect(applyRemoteDeletions(snapshot, null)).toBe(snapshot);
  });
});

describe("applyChangedRecords", () => {
  it("overlays the server's version of records it wrote, keeping the rest", () => {
    const snapshot = { snakes: [{ id: "a", name: "local" }, { id: "b", name: "untouched" }] };
    const result = applyChangedRecords(snapshot, { snakes: [{ id: "a", name: "server" }] });
    expect(result.snakes).toContainEqual({ id: "a", name: "server" });
    expect(result.snakes).toContainEqual({ id: "b", name: "untouched" });
    expect(result.snakes).toHaveLength(2);
  });

  it("adds records the server returned that we did not have", () => {
    const result = applyChangedRecords({ snakes: [] }, { snakes: [{ id: "new" }] });
    expect(result.snakes).toEqual([{ id: "new" }]);
  });

  it("keeps existing planner state when the response carries none", () => {
    const snapshot = { snakes: [], plannerState: { groups: ["Breeders"] } };
    expect(applyChangedRecords(snapshot, { snakes: [] }).plannerState).toEqual({ groups: ["Breeders"] });
  });
});
