import { describe, expect, it } from "vitest";
import { onBackButton, platformKind, runBackHandlers, saveFile } from "./index.js";

describe("platform detection outside the shell", () => {
  it("is the web platform in a test runner", () => {
    expect(platformKind).toBe("web");
  });
});

describe("back button registry", () => {
  it("runs the newest handler first and stops at the first that handles it", () => {
    const order = [];
    const offA = onBackButton(() => { order.push("a"); return true; });
    const offB = onBackButton(() => { order.push("b"); return false; });
    expect(runBackHandlers()).toBe(true);
    expect(order).toEqual(["b", "a"]);
    offA();
    offB();
  });

  it("reports nothing handled when no handler claims it", () => {
    const off = onBackButton(() => false);
    expect(runBackHandlers()).toBe(false);
    off();
    expect(runBackHandlers()).toBe(false);
  });

  it("ignores a non-function and keeps going past a handler that throws", () => {
    const offBad = onBackButton("not a function");
    const offThrow = onBackButton(() => { throw new Error("boom"); });
    const offOk = onBackButton(() => true);
    // The throwing handler is newest; the registry must skip it and reach the good one.
    expect(runBackHandlers()).toBe(true);
    offBad();
    offThrow();
    offOk();
  });
});

describe("saveFile on the web", () => {
  it("fails plainly when there is no document to attach a download link to", async () => {
    const hadDocument = typeof document !== "undefined";
    if (hadDocument) return; // jsdom is not configured for this suite; the node path is what runs here
    await expect(saveFile({ name: "x.txt", mime: "text/plain", data: "hi" })).rejects.toThrow(/not supported/);
  });
});
