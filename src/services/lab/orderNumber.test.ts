import { describe, expect, it } from "vitest";
import { buildNextOrderNumber, parseOrderNumber } from "./orderNumber";

describe("lab order number format", () => {
  it("starts a month at AA00001", () => {
    expect(buildNextOrderNumber([], "2026-04-24T10:00:00.000Z")).toBe("04AA00001");
  });

  it("increments the numeric portion within the same month", () => {
    expect(buildNextOrderNumber(["04AA00001", "04AA00002"], "2026-04-24T10:00:00.000Z")).toBe("04AA00003");
  });

  it("increments the letter block after the numeric range is exhausted", () => {
    expect(buildNextOrderNumber(["04AA09999"], "2026-04-24T10:00:00.000Z")).toBe("04AB00001");
  });

  it("parses the new format correctly", () => {
    expect(parseOrderNumber("04AC00123")).toMatchObject({
      monthToken: "04",
      numeric: 123,
    });
  });
});
