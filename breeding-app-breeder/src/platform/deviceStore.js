// Where the collection lives on this device.
//
// It used to live in localStorage, which a WebView caps at about 5 MB per app no matter how
// much free space the phone has. Photos are stored inline and backups were copied beside the
// live data, so a real collection outgrew that cap and restoring a backup failed with
// "local storage is full" on a phone with gigabytes free. IndexedDB is bounded by the
// device's free space instead.
//
// App code reads storage synchronously in dozens of state initialisers, so the store keeps
// the same shape: everything is loaded into memory once, before React mounts, and reads come
// from that cache. Writes land in the cache at once and reach IndexedDB in one batched
// transaction shortly after, and immediately when the app goes to the background.
//
// Only the keys in MANAGED_KEYS move. Small preferences and auth tokens stay in localStorage,
// where other modules expect them.

export const DEVICE_STORE_DB_NAME = "serpentora-device";
const DB_NAME = DEVICE_STORE_DB_NAME;
const DB_VERSION = 1;
const STORE_NAME = "kv";

// Set in localStorage once the collection has been moved. After that, IndexedDB failing to
// open must never fall back to localStorage: it is empty, and starting from it would show
// the demo collection and could sync that over the keeper's real data.
export const MIGRATION_MARKER_KEY = "serpentoraDeviceStoreV1";

export const MANAGED_KEYS = Object.freeze([
  "breedingPlannerSnakes",
  "breedingPlannerPairings",
  "breedingPlannerBreedingCycles",
  "breedingPlannerFollicleExams",
  "breedingPlannerBreedingSettings",
  "breedingPlannerGroups",
  "breedingPlannerGroupsBySpecies",
  "breedingPlannerShowGroups",
  "breedingPlannerHiddenGroups",
  "breedingPlannerCustomStatusTags",
  "breedingPlannerRemovedStatusTags",
  "breedingPlannerBreederInfo",
  "breedingPlannerMorphAliases",
  "breedingPlannerGeneAliases",
  "breedingPlannerSpeciesBackfillDone",
  "breedingPlannerLeucisticType",
  "breedingPlannerLastFeedDefaults",
  "breedingPlannerBackupSettings",
  "breedingPlannerBackupSnapshot",
  "breedingPlannerBackupVault",
  "breedingPlannerSpaces",
  "breedingPlannerQuarantineNotice",
  "breedingPlannerPhotoCompressionV1",
  "breedingPlannerPreRestoreSnapshot",
  "bpSyncTombstones",
  "serpentoraRecentAnimals",
]);
const managedSet = new Set(MANAGED_KEYS);
export const isManagedKey = (key) => managedSet.has(key);

export const STORAGE_FULL_EVENT = "serpentora:storage-full";

const FLUSH_DELAY_MS = 150;
const RETRY_DELAYS_MS = [1000, 3000, 10000, 30000];

const getLocalStorage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const isQuotaError = (err) => {
  const name = String(err?.name || "");
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || err?.code === 22;
};

// ── IndexedDB backend ──────────────────────────────────────────────────────────────────────
// A backend is { loadAll(): Promise<Map>, writeBatch(puts, deletes): Promise, clear(): Promise,
// close() }. Tests pass an in-memory one; the app uses this.

export const createIndexedDbBackend = (factory = typeof indexedDB !== "undefined" ? indexedDB : null) => {
  let dbPromise = null;
  const open = () => {
    if (!factory) return Promise.reject(new Error("IndexedDB is not available."));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          // Another tab upgrading or a reset deleting the database closes this handle.
          db.onversionchange = () => db.close();
          resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB open was blocked."));
      });
      dbPromise.catch(() => {
        dbPromise = null;
      });
    }
    return dbPromise;
  };

  const runTransaction = async (mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = work(store);
      } catch (err) {
        try { tx.abort(); } catch { /* already finished */ }
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  };

  return {
    name: "indexeddb",
    async loadAll() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const entries = new Map();
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (typeof cursor.value === "string") entries.set(String(cursor.key), cursor.value);
          cursor.continue();
        };
        tx.oncomplete = () => resolve(entries);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB read aborted."));
      });
    },
    writeBatch(puts, deletes) {
      return runTransaction("readwrite", (store) => {
        puts.forEach((value, key) => store.put(value, key));
        deletes.forEach((key) => store.delete(key));
      });
    },
    clear() {
      return runTransaction("readwrite", (store) => {
        store.clear();
      });
    },
    async close() {
      if (!dbPromise) return;
      try {
        (await dbPromise).close();
      } catch {
        // Never opened.
      }
      dbPromise = null;
    },
  };
};

export const createMemoryBackend = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    name: "memory",
    data,
    failNextWrite: null,
    async loadAll() {
      return new Map(data);
    },
    async writeBatch(puts, deletes) {
      if (this.failNextWrite) {
        const err = this.failNextWrite;
        this.failNextWrite = null;
        throw err;
      }
      puts.forEach((value, key) => data.set(key, value));
      deletes.forEach((key) => data.delete(key));
    },
    async clear() {
      data.clear();
    },
    async close() {},
  };
};

// ── The store ──────────────────────────────────────────────────────────────────────────────

export const createDeviceStore = ({ backend, localStorage: ls = getLocalStorage(), dispatch } = {}) => {
  // "idb": cache backed by IndexedDB. "local": IndexedDB unavailable and the collection was
  // never moved, so behave exactly as before. "unavailable": moved, but IndexedDB will not
  // open; the app must not start (see MIGRATION_MARKER_KEY).
  let mode = "pending";
  let initError = null;
  const cache = new Map();
  const dirty = new Set();
  const deleted = new Set();
  let flushTimer = null;
  let flushing = null;
  let retryIndex = 0;
  let lastFailure = null;
  let failureReported = false;

  const emit = (name, detail) => {
    try {
      if (dispatch) dispatch(name, detail);
      else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {
      // No event target; the failure is still recorded in status().
    }
  };

  const reportFailure = (err) => {
    lastFailure = { at: new Date().toISOString(), quota: isQuotaError(err), message: String(err?.message || err) };
    if (failureReported) return;
    failureReported = true;
    // `limited`: the write went to localStorage, whose cap is a few megabytes whatever the
    // device has free, so "the device is out of space" would be the wrong thing to say.
    emit(STORAGE_FULL_EVENT, { quota: lastFailure.quota, limited: mode !== "idb", error: lastFailure.message });
  };

  const scheduleFlush = (delay = FLUSH_DELAY_MS) => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {
        // Recorded and retried inside flush.
      });
    }, delay);
  };

  const flush = async () => {
    if (mode !== "idb") return true;
    if (flushing) {
      await flushing.catch(() => {});
      if (!dirty.size && !deleted.size) return true;
    }
    if (!dirty.size && !deleted.size) return true;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const puts = new Map();
    dirty.forEach((key) => {
      if (cache.has(key)) puts.set(key, cache.get(key));
    });
    const deletes = new Set(deleted);
    dirty.clear();
    deleted.clear();
    flushing = backend.writeBatch(puts, deletes);
    try {
      await flushing;
      retryIndex = 0;
      lastFailure = null;
      failureReported = false;
      return true;
    } catch (err) {
      // Put the keys back so the next attempt carries them, unless they changed again since.
      puts.forEach((_, key) => dirty.add(key));
      deletes.forEach((key) => {
        if (!cache.has(key)) deleted.add(key);
      });
      reportFailure(err);
      const delay = RETRY_DELAYS_MS[Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)];
      retryIndex += 1;
      scheduleFlush(delay);
      throw err;
    } finally {
      flushing = null;
    }
  };

  const init = async () => {
    const marker = ls?.getItem?.(MIGRATION_MARKER_KEY) === "idb";
    let stored;
    try {
      if (!backend) throw new Error("IndexedDB is not available.");
      stored = await backend.loadAll();
    } catch (err) {
      initError = err;
      mode = marker ? "unavailable" : "local";
      return status();
    }
    stored.forEach((value, key) => cache.set(key, value));

    // Anything still in localStorage is newer than IndexedDB: either this is the first run
    // after the move, or something (an older build, a test seeding data) wrote it since.
    const pending = new Map();
    MANAGED_KEYS.forEach((key) => {
      let value = null;
      try {
        value = ls?.getItem?.(key) ?? null;
      } catch {
        value = null;
      }
      if (value !== null) pending.set(key, value);
    });

    if (pending.size) {
      try {
        await backend.writeBatch(pending, new Set());
        // Read it back before deleting the only other copy.
        const check = await backend.loadAll();
        const verified = [...pending].every(([key, value]) => check.get(key) === value);
        if (!verified) throw new Error("Moved data did not read back intact.");
        pending.forEach((value, key) => cache.set(key, value));
        pending.forEach((_, key) => {
          try { ls.removeItem(key); } catch { /* harmless: it is re-imported next time */ }
        });
      } catch (err) {
        // Keep using localStorage this session; the move is retried on the next launch.
        initError = err;
        mode = marker ? "unavailable" : "local";
        cache.clear();
        return status();
      }
    }

    try {
      ls?.setItem?.(MIGRATION_MARKER_KEY, "idb");
    } catch {
      // Without the marker a later IndexedDB failure falls back to localStorage, which is the
      // old behaviour; nothing is lost by failing to write it.
    }
    mode = "idb";
    return status();
  };

  const getItem = (key) => {
    if (mode === "idb" && isManagedKey(key)) return cache.has(key) ? cache.get(key) : null;
    try {
      return ls?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  };

  // Returns false only when the value could not be kept even in memory (local mode quota).
  const setItem = (key, value) => {
    const text = String(value);
    if (mode === "idb" && isManagedKey(key)) {
      if (cache.get(key) === text && !deleted.has(key)) return true;
      cache.set(key, text);
      deleted.delete(key);
      dirty.add(key);
      scheduleFlush();
      return true;
    }
    try {
      ls.setItem(key, text);
      return true;
    } catch (err) {
      reportFailure(err);
      return false;
    }
  };

  const removeItem = (key) => {
    if (mode === "idb" && isManagedKey(key)) {
      if (!cache.has(key)) return;
      cache.delete(key);
      dirty.delete(key);
      deleted.add(key);
      scheduleFlush();
      return;
    }
    try {
      ls?.removeItem?.(key);
    } catch {
      // Nothing to remove.
    }
  };

  // Writes several values in one transaction and only then shows them to readers. Used by
  // restore, which must either keep the whole backup or change nothing.
  const commit = async (entries) => {
    const puts = new Map(Object.entries(entries).map(([key, value]) => [key, String(value)]));
    if (mode === "idb") {
      await backend.writeBatch(puts, new Set());
      puts.forEach((value, key) => {
        cache.set(key, value);
        dirty.delete(key);
        deleted.delete(key);
      });
      return;
    }
    // localStorage cannot do a transaction; write in order and put the old values back if
    // one fails, so a restore that does not fit leaves the device as it was.
    const previous = new Map();
    try {
      puts.forEach((value, key) => {
        previous.set(key, ls.getItem(key));
        ls.setItem(key, value);
      });
    } catch (err) {
      previous.forEach((value, key) => {
        try {
          if (value === null) ls.removeItem(key);
          else ls.setItem(key, value);
        } catch {
          // Best effort; the original value was readable a moment ago.
        }
      });
      throw err;
    }
  };

  const clearAll = async () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    cache.clear();
    dirty.clear();
    deleted.clear();
    if (mode === "idb") await backend.clear();
  };

  // Bytes each managed key takes, largest first, for the Settings storage panel. JavaScript
  // strings are UTF-16, so two bytes per character is what the engine actually holds.
  const usage = () => {
    const rows = [];
    MANAGED_KEYS.forEach((key) => {
      const value = getItem(key);
      if (typeof value === "string" && value.length) rows.push({ key, bytes: value.length * 2 });
    });
    return rows.sort((a, b) => b.bytes - a.bytes);
  };

  function status() {
    return {
      mode,
      backend: backend?.name || null,
      pendingWrites: dirty.size + deleted.size,
      lastFailure,
      initError: initError ? String(initError?.message || initError) : null,
    };
  }

  return { init, getItem, setItem, removeItem, flush, commit, clearAll, usage, status };
};

// ── App singleton ──────────────────────────────────────────────────────────────────────────

let singleton = null;
export const getDeviceStore = () => {
  if (!singleton) singleton = createDeviceStore({ backend: createIndexedDbBackend() });
  return singleton;
};

// Called once from index.jsx before the app renders.
export const initDeviceStore = async () => {
  const store = getDeviceStore();
  const result = await store.init();
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    // A phone can kill a backgrounded app without warning; write before that can happen.
    const flushNow = () => {
      store.flush().catch(() => {});
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushNow();
    });
    window.addEventListener("pagehide", flushNow);
    // Ask the browser not to evict the collection under storage pressure. Android WebView and
    // installed PWAs grant this; a plain browser tab may refuse, which changes nothing.
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch {
      // Not supported.
    }
  }
  return result;
};

// Read-only helpers for modules outside App.jsx that need the collection.
/** @type {(key: string, fallback?: any) => any} */
export const readStoredJson = (key, fallback = null) => {
  try {
    const raw = getDeviceStore().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
};

export const writeStoredJson = (key, value) => getDeviceStore().setItem(key, JSON.stringify(value));

export const estimateDeviceStorage = async () => {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    if (!estimate) return null;
    return {
      usage: Number(estimate.usage) || 0,
      quota: Number(estimate.quota) || 0,
      persisted: persisted === true,
    };
  } catch {
    return null;
  }
};
