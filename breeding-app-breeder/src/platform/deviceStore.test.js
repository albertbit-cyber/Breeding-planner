import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIGRATION_MARKER_KEY,
  STORAGE_FULL_EVENT,
  createDeviceStore,
  createMemoryBackend,
} from "./deviceStore.js";

const SNAKES = "breedingPlannerSnakes";
const PAIRINGS = "breedingPlannerPairings";

// A localStorage stand-in with an optional byte cap, like a WebView's.
const createLocalStorage = (initial = {}, capChars = Infinity) => {
  const data = new Map(Object.entries(initial));
  const size = () => [...data.values()].reduce((sum, v) => sum + v.length, 0);
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      const previous = data.get(key);
      data.set(key, String(value));
      if (size() > capChars) {
        if (previous === undefined) data.delete(key);
        else data.set(key, previous);
        const err = new Error("quota");
        err.name = "QuotaExceededError";
        throw err;
      }
    },
    removeItem: (key) => data.delete(key),
  };
};

const failingBackend = () => ({
  name: "broken",
  loadAll: async () => {
    throw new Error("open failed");
  },
  writeBatch: async () => {
    throw new Error("open failed");
  },
  clear: async () => {},
  close: async () => {},
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deviceStore init", () => {
  it("moves the collection out of localStorage, then reads it from the new store", async () => {
    const ls = createLocalStorage({ [SNAKES]: "[1,2]", unrelatedPref: "x" });
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: ls, dispatch: () => {} });

    const status = await store.init();

    expect(status.mode).toBe("idb");
    expect(backend.data.get(SNAKES)).toBe("[1,2]");
    expect(ls.getItem(SNAKES)).toBeNull();
    expect(ls.getItem("unrelatedPref")).toBe("x");
    expect(ls.getItem(MIGRATION_MARKER_KEY)).toBe("idb");
    expect(store.getItem(SNAKES)).toBe("[1,2]");
  });

  it("lets a value written to localStorage after the move win over the stored one", async () => {
    const ls = createLocalStorage({ [SNAKES]: "[\"seeded\"]", [MIGRATION_MARKER_KEY]: "idb" });
    const backend = createMemoryBackend({ [SNAKES]: "[\"old\"]", [PAIRINGS]: "[\"kept\"]" });
    const store = createDeviceStore({ backend, localStorage: ls, dispatch: () => {} });

    await store.init();

    expect(store.getItem(SNAKES)).toBe("[\"seeded\"]");
    expect(store.getItem(PAIRINGS)).toBe("[\"kept\"]");
  });

  it("keeps localStorage untouched when the moved data does not read back", async () => {
    const ls = createLocalStorage({ [SNAKES]: "[1]" });
    const backend = createMemoryBackend();
    backend.loadAll = vi
      .fn()
      .mockResolvedValueOnce({ entries: new Map(), photos: new Map() })
      .mockResolvedValueOnce({ entries: new Map([[SNAKES, "corrupt"]]), photos: new Map() });
    const store = createDeviceStore({ backend, localStorage: ls, dispatch: () => {} });

    const status = await store.init();

    expect(status.mode).toBe("local");
    expect(ls.getItem(SNAKES)).toBe("[1]");
    expect(ls.getItem(MIGRATION_MARKER_KEY)).toBeNull();
    expect(store.getItem(SNAKES)).toBe("[1]");
  });

  it("falls back to localStorage when IndexedDB never worked here", async () => {
    const ls = createLocalStorage({ [SNAKES]: "[1]" });
    const store = createDeviceStore({ backend: failingBackend(), localStorage: ls, dispatch: () => {} });

    const status = await store.init();

    expect(status.mode).toBe("local");
    expect(store.getItem(SNAKES)).toBe("[1]");
    store.setItem(SNAKES, "[2]");
    expect(ls.getItem(SNAKES)).toBe("[2]");
  });

  it("refuses to fall back once the collection has moved, so an empty localStorage is never used", async () => {
    const ls = createLocalStorage({ [MIGRATION_MARKER_KEY]: "idb" });
    const store = createDeviceStore({ backend: failingBackend(), localStorage: ls, dispatch: () => {} });

    const status = await store.init();

    expect(status.mode).toBe("unavailable");
    expect(status.initError).toMatch(/open failed/);
  });
});

describe("deviceStore writes", () => {
  it("batches writes and reaches the backend on flush", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {} });
    await store.init();

    store.setItem(SNAKES, "[1]");
    store.setItem(PAIRINGS, "[2]");
    expect(store.getItem(SNAKES)).toBe("[1]");
    expect(store.status().pendingWrites).toBe(2);

    await store.flush();

    expect(backend.data.get(SNAKES)).toBe("[1]");
    expect(backend.data.get(PAIRINGS)).toBe("[2]");
    expect(store.status().pendingWrites).toBe(0);
  });

  it("holds more than a WebView's localStorage cap", async () => {
    const ls = createLocalStorage({}, 5 * 1024 * 1024);
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: ls, dispatch: () => {} });
    await store.init();

    const big = JSON.stringify(["x".repeat(8 * 1024 * 1024)]);
    store.setItem(SNAKES, big);
    await store.flush();

    expect(backend.data.get(SNAKES)).toBe(big);
  });

  it("reports a failed write once, keeps the change and retries it", async () => {
    vi.useFakeTimers();
    const events = [];
    const backend = createMemoryBackend();
    const store = createDeviceStore({
      backend,
      localStorage: createLocalStorage(),
      dispatch: (name, detail) => events.push({ name, detail }),
    });
    await store.init();
    const quota = new Error("full");
    quota.name = "QuotaExceededError";
    backend.failNextWrite = quota;

    store.setItem(SNAKES, "[1]");
    await expect(store.flush()).rejects.toThrow("full");

    expect(events).toEqual([{ name: STORAGE_FULL_EVENT, detail: { quota: true, limited: false, error: "full" } }]);
    expect(store.getItem(SNAKES)).toBe("[1]");
    expect(store.status().lastFailure.quota).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    expect(backend.data.get(SNAKES)).toBe("[1]");
    expect(store.status().lastFailure).toBeNull();
  });

  it("removes keys from the backend", async () => {
    const backend = createMemoryBackend({ [SNAKES]: "[1]" });
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {} });
    await store.init();

    store.removeItem(SNAKES);
    await store.flush();

    expect(store.getItem(SNAKES)).toBeNull();
    expect(backend.data.has(SNAKES)).toBe(false);
  });
});

describe("deviceStore commit", () => {
  it("shows committed values only after the backend accepted them", async () => {
    const backend = createMemoryBackend({ [SNAKES]: "[\"before\"]" });
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {} });
    await store.init();
    backend.failNextWrite = new Error("disk full");

    await expect(store.commit({ [SNAKES]: "[\"after\"]", [PAIRINGS]: "[]" })).rejects.toThrow("disk full");

    expect(store.getItem(SNAKES)).toBe("[\"before\"]");
    expect(store.getItem(PAIRINGS)).toBeNull();

    await store.commit({ [SNAKES]: "[\"after\"]" });
    expect(store.getItem(SNAKES)).toBe("[\"after\"]");
    expect(backend.data.get(SNAKES)).toBe("[\"after\"]");
  });

  it("puts localStorage back as it was when a commit does not fit there", async () => {
    const ls = createLocalStorage({ [SNAKES]: "[1]" }, 50);
    const store = createDeviceStore({ backend: failingBackend(), localStorage: ls, dispatch: () => {} });
    await store.init();

    await expect(
      store.commit({ [PAIRINGS]: "[]", [SNAKES]: JSON.stringify(["y".repeat(100)]) }),
    ).rejects.toThrow("quota");

    expect(ls.getItem(SNAKES)).toBe("[1]");
    expect(ls.getItem(PAIRINGS)).toBeNull();
  });
});

describe("deviceStore usage", () => {
  it("lists managed keys largest first", async () => {
    const backend = createMemoryBackend({ [SNAKES]: "x".repeat(10), [PAIRINGS]: "x".repeat(3) });
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {} });
    await store.init();

    expect(store.usage()).toEqual([
      { key: SNAKES, bytes: 10 },
      { key: PAIRINGS, bytes: 3 },
    ]);
  });
});

describe("deviceStore photos", () => {
  const photo = (seed) => `data:image/jpeg;base64,${String(seed).repeat(4000)}`;
  const snakesWith = (...urls) => JSON.stringify(urls.map((url, i) => ({ id: `a${i}`, imageUrl: url, photos: [{ url }] })));
  let n = 0;
  const idFactory = () => `id${(n += 1)}`;

  it("stores each photo once and gives readers back exactly what was written", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    const text = snakesWith(photo(1), photo(2));

    store.setItem(SNAKES, text);
    await store.flush();

    expect(store.getItem(SNAKES)).toBe(text);
    // Two photos, each used twice (photo list and cover), stored once each.
    expect(backend.photos.size).toBe(2);
    expect(backend.data.get(SNAKES)).not.toContain("data:");
    expect(backend.data.get(SNAKES).length).toBeLessThan(400);
  });

  it("shares one stored photo between the collection and a snapshot of it", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    const text = snakesWith(photo(3));

    store.setItem(SNAKES, text);
    store.setItem("breedingPlannerPreRestoreSnapshot", JSON.stringify({ payload: { snakes: JSON.parse(text) } }));
    await store.flush();

    expect(backend.photos.size).toBe(1);
  });

  it("removes a photo once nothing refers to it", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    store.setItem(SNAKES, snakesWith(photo(4), photo(5)));
    await store.flush();

    store.setItem(SNAKES, snakesWith(photo(5)));
    await store.flush();

    expect(backend.photos.size).toBe(1);
    expect(store.getItem(SNAKES)).toBe(snakesWith(photo(5)));
  });

  it("loads stored photos back, and converts values that still carry them inline", async () => {
    const inline = snakesWith(photo(6));
    const backend = createMemoryBackend({ [SNAKES]: inline });
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    await store.flush();

    expect(backend.photos.size).toBe(1);
    expect(backend.data.get(SNAKES)).not.toContain("data:");

    const reopened = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await reopened.init();
    expect(reopened.getItem(SNAKES)).toBe(inline);
    expect(reopened.status().pendingWrites).toBe(0);
  });

  it("commits restored photos in the same transaction as the records", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    const text = snakesWith(photo(7));

    await store.commit({ [SNAKES]: text });

    expect(backend.photos.size).toBe(1);
    expect(store.getItem(SNAKES)).toBe(text);
  });

  it("leaves nothing behind when a commit with new photos fails", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    backend.failNextWrite = new Error("disk full");

    await expect(store.commit({ [SNAKES]: snakesWith(photo(8)) })).rejects.toThrow("disk full");

    expect(store.status().storedPhotos).toBe(0);
    expect(store.getItem(SNAKES)).toBeNull();
  });

  it("reports photos as their own usage row", async () => {
    const backend = createMemoryBackend();
    const store = createDeviceStore({ backend, localStorage: createLocalStorage(), dispatch: () => {}, idFactory });
    await store.init();
    store.setItem(SNAKES, snakesWith(photo(9)));

    const rows = store.usage();

    expect(rows[0].key).toBe("photos");
    expect(rows[0].bytes).toBeGreaterThan(4000);
  });
});
