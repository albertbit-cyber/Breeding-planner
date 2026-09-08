import { describe, expect, it } from "vitest";
import { groupOrdersByArchiveDate } from "./OrderArchivePage.jsx";

const order = (id, archivedAt) => ({ id, archivedAt, orderNumber: id });

describe("grouping the archive by year and month", () => {
  it("nests months inside years, newest first", () => {
    const groups = groupOrdersByArchiveDate([
      order("a", "2025-03-04T10:00:00.000Z"),
      order("b", "2026-01-15T10:00:00.000Z"),
      order("c", "2026-03-02T10:00:00.000Z"),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["2026", "2025"]);
    expect(groups[0].months.map((month) => month.label)).toEqual(["March", "January"]);
    expect(groups[1].months.map((month) => month.label)).toEqual(["March"]);
  });

  it("counts every order in the year, across its months", () => {
    const groups = groupOrdersByArchiveDate([
      order("a", "2026-01-15T10:00:00.000Z"),
      order("b", "2026-01-20T10:00:00.000Z"),
      order("c", "2026-07-01T10:00:00.000Z"),
    ]);

    expect(groups[0].count).toBe(3);
    expect(groups[0].months.map((month) => month.orders.length)).toEqual([1, 2]);
  });

  it("sorts orders inside a month newest first", () => {
    const groups = groupOrdersByArchiveDate([
      order("older", "2026-01-02T10:00:00.000Z"),
      order("newer", "2026-01-28T10:00:00.000Z"),
    ]);

    expect(groups[0].months[0].orders.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("keeps an order with an unreadable date instead of dropping it", () => {
    // An order silently vanishing from the archive is the one failure this page
    // must not have, so a bad date gets a bucket rather than a filter.
    const groups = groupOrdersByArchiveDate([
      order("good", "2026-01-15T10:00:00.000Z"),
      order("bad", "not-a-date"),
      order("missing", undefined),
    ]);

    const undated = groups.find((group) => group.label === "Undated");
    expect(undated?.count).toBe(2);
    // ...and it sorts last, after every real year.
    expect(groups[groups.length - 1].label).toBe("Undated");
  });

  it("returns nothing for an empty or absent list", () => {
    expect(groupOrdersByArchiveDate([])).toEqual([]);
    expect(groupOrdersByArchiveDate(undefined)).toEqual([]);
    expect(groupOrdersByArchiveDate(null)).toEqual([]);
  });
});
