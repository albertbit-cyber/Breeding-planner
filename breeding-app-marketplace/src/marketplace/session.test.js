import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { peekIntent, readSession, rememberIntent, takeIntent } from "./session";

/** A minimal Storage, since these tests run without a DOM. */
const memoryStorage = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
};

beforeEach(() => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("held intents", () => {
  it("keeps the action and the page it came from until it is taken, once", () => {
    rememberIntent({ kind: "message", listingId: "l1", returnTo: "/a/l1" });
    expect(peekIntent()).toMatchObject({ kind: "message", listingId: "l1", returnTo: "/a/l1" });
    expect(takeIntent()).toMatchObject({ kind: "message" });
    expect(peekIntent()).toBeNull();
  });

  it("forgets an intent older than an hour rather than surprising the visitor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z"));
    rememberIntent({ kind: "favorite", listingId: "l1" });
    vi.setSystemTime(new Date("2026-10-05T11:00:01Z"));
    expect(peekIntent()).toBeNull();
  });

  it("survives storage that throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => rememberIntent({ kind: "favorite" })).not.toThrow();
    expect(peekIntent()).toBeNull();
    expect(takeIntent()).toBeNull();
  });
});

describe("readSession", () => {
  it("is anonymous without a stored session", () => {
    expect(readSession()).toMatchObject({ isAuthenticated: false, isSeller: false });
  });

  it("reads a buyer as signed in but not a seller", () => {
    localStorage.setItem(
      "breedingPlannerBreederAuthSession",
      JSON.stringify({ isAuthenticated: true, role: "buyer", profile: { displayName: "Ada" } })
    );
    expect(readSession()).toMatchObject({ isAuthenticated: true, role: "buyer", isSeller: false, displayName: "Ada" });
  });

  it("reads a breeder as a seller", () => {
    localStorage.setItem("breedingPlannerBreederAuthSession", JSON.stringify({ isAuthenticated: true, role: "breeder" }));
    expect(readSession().isSeller).toBe(true);
  });
});
