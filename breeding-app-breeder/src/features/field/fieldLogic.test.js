import { describe, expect, it } from "vitest";
import {
  appendLog,
  buildLocationIndex,
  buildQuickLogEntry,
  dueFeeds,
  geneticsText,
  isRetired,
  pushRecent,
  removeLog,
  searchSnakes,
  sexLetter,
  snakeImage,
} from "./fieldLogic.js";

const snake = (over = {}) => ({ id: "26-F-1", name: "Athena", sex: "F", status: "Active", morphs: ["Clown"], hets: ["Hypo"], logs: {}, ...over });

describe("field row helpers", () => {
  it("reads sex, genetics and image from the desktop record shape", () => {
    expect(sexLetter(snake())).toBe("F");
    expect(sexLetter({ sex: "male" })).toBe("M");
    expect(sexLetter({})).toBe("");
    expect(geneticsText(snake({ possibleHets: ["Pied"] }))).toBe("Clown | het Hypo | possible het Pied");
    expect(geneticsText({ genetics: "Pastel" })).toBe("Pastel");
    expect(snakeImage({ photos: [{ url: "a" }, { url: "b" }] })).toBe("b");
    expect(snakeImage({ imageUrl: "x", photos: [{ url: "a" }] })).toBe("x");
  });

  it("treats sold and deceased animals as retired", () => {
    expect(isRetired(snake({ status: "Sold" }))).toBe(true);
    expect(isRetired(snake({ status: "Deceased" }))).toBe(true);
    expect(isRetired(snake())).toBe(false);
  });

  it("follows the archive: an archive record or a removed stub retires the animal", () => {
    expect(isRetired(snake({ archive: { reason: "given_away", date: "2026-10-01" } }))).toBe(true);
    expect(isRetired(snake({ status: "Removed" }))).toBe(true);
    expect(isRetired(snake({ status: "Quarantine" }))).toBe(false);
  });
});

describe("dueFeeds", () => {
  const events = { a: { date: "2026-10-10" }, b: { date: "2026-10-12" }, c: { date: "2026-10-20" } };
  const get = (s) => events[s.id] || null;
  it("lists feeds due today or earlier, most overdue first, skipping demo and retired animals", () => {
    const rows = dueFeeds([
      snake({ id: "b", name: "Boris" }),
      snake({ id: "a", name: "Athena" }),
      snake({ id: "c", name: "Cinder" }),
      snake({ id: "a", name: "Demo", isDemo: true }),
      snake({ id: "a", name: "Gone", status: "Sold" }),
    ], get, "2026-10-12");
    expect(rows.map((r) => [r.snake.name, r.overdueDays])).toEqual([["Athena", 2], ["Boris", 0]]);
  });

  it("survives a helper that throws", () => {
    expect(dueFeeds([snake()], () => { throw new Error("x"); })).toEqual([]);
  });
});

describe("searchSnakes", () => {
  it("matches name, id and genetics, ignores demo animals and caps results", () => {
    const rows = [snake(), snake({ id: "26-M-2", name: "Boris", morphs: ["Pinstripe"] }), snake({ id: "d", name: "Athena Demo", isDemo: true })];
    expect(searchSnakes(rows, "ath").map((s) => s.id)).toEqual(["26-F-1"]);
    expect(searchSnakes(rows, "pinstripe").map((s) => s.name)).toEqual(["Boris"]);
    expect(searchSnakes(rows, "26-").length).toBe(2);
    expect(searchSnakes(rows, "26-", 1).length).toBe(1);
    expect(searchSnakes(rows, "   ")).toEqual([]);
  });

  it("leaves archived animals out", () => {
    const rows = [snake(), snake({ id: "26-F-9", name: "Athena II", archive: { reason: "sold", date: "2026-10-01" } })];
    expect(searchSnakes(rows, "athena").map((s) => s.id)).toEqual(["26-F-1"]);
  });
});

describe("buildLocationIndex", () => {
  it("maps rack slots and terrarium occupants to a readable place", () => {
    const index = buildLocationIndex({
      rooms: [{ id: "r1", name: "Snake room" }],
      heatRacks: [{ id: "h1", roomId: "r1", name: "Rack A", slots: [{ levelIndex: 0, columnIndex: 1, snakeId: "26-F-1" }, { levelIndex: 1, columnIndex: 0, snakeId: "" }] }],
      terrariums: [{ id: "t1", roomId: "r1", name: "Big viv", occupantIds: ["26-M-2"] }],
    });
    expect(index.get("26-F-1")).toBe("Snake room / Rack A / L1-2");
    expect(index.get("26-M-2")).toBe("Snake room / Big viv");
    expect(index.has("")).toBe(false);
  });
});

describe("quick log entries", () => {
  it("writes the same shapes the desktop editor writes", () => {
    const feed = buildQuickLogEntry("feed", { feed: "Rat", size: "Small", weightGrams: "45", refused: false }, { today: "2026-10-12" });
    expect(feed.key).toBe("feeds");
    expect(feed.entry).toMatchObject({ date: "2026-10-12", feed: "Rat", size: "Small", weightGrams: 45, method: "Other", refused: false, notes: "" });
    expect(feed.entry.id).toBeTruthy();

    const refused = buildQuickLogEntry("feed", { feed: "Rat", refused: true });
    expect(refused.entry.refused).toBe(true);

    expect(buildQuickLogEntry("weight", { grams: "850" }).entry).toMatchObject({ grams: 850 });
    expect(buildQuickLogEntry("shed", { complete: false }).entry).toMatchObject({ complete: false });
    expect(buildQuickLogEntry("clean", { notes: "spot" }).entry).toMatchObject({ notes: "spot" });
  });

  it("refuses an empty feed or weight", () => {
    expect(() => buildQuickLogEntry("feed", {})).toThrow(/offered/);
    expect(() => buildQuickLogEntry("weight", { grams: "0" })).toThrow(/grams/);
    expect(() => buildQuickLogEntry("nope", {})).toThrow(/Unknown/);
  });

  it("appends to and removes from a snake's log bucket without touching the others", () => {
    const base = snake({ logs: { feeds: [{ id: "f1" }], weights: [{ id: "w1" }] } });
    const added = appendLog(base, "feeds", { id: "f2" });
    expect(added.logs.feeds.map((e) => e.id)).toEqual(["f1", "f2"]);
    expect(added.logs.weights).toBe(base.logs.weights);
    const removed = removeLog(added, "feeds", "f2");
    expect(removed.logs.feeds.map((e) => e.id)).toEqual(["f1"]);
    expect(appendLog({ id: "x" }, "sheds", { id: "s1" }).logs.sheds).toEqual([{ id: "s1" }]);
  });
});

describe("pushRecent", () => {
  it("moves an id to the front, dedupes and caps the list", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushRecent(["a"], "")).toEqual(["a"]);
    expect(pushRecent(["1", "2", "3"], "4", 3)).toEqual(["4", "1", "2"]);
  });
});
