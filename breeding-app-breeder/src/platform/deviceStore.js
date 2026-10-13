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
// Embedded photos are stored once in their own table and referenced from the JSON (see
// photoPool.js). The cache holds that stored form; reads put the photos back.
//
// Only the keys in MANAGED_KEYS move. Small preferences and auth tokens stay in localStorage,
// where other modules expect them.

import { createPhotoPool } from "./photoPool.js";

export const DEVICE_STORE_DB_NAME = "serpentora-device";
const DB_NAME = DEVICE_STORE_DB_NAME;
// 2 added the photos table. A build that only knows version 1 cannot open a version 2
// database and shows the "close and reopen" screen rather than reading references it does not
// understand.
const DB_VERSION = 2;
const STORE_NAME = "kv";
const PHOTO_STORE_NAME = "photos";

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

// usage() reports the photos table under this name.
export const PHOTOS_USAGE_KEY = "photos";

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
// A backend is { loadAll(): Promise<{entries: Map, photos: Map}>,
// writeBatch({puts, deletes, photoPuts, photoDeletes}): Promise, clear(): Promise, close() }.
// A writeBatch is one transaction over both tables. Tests pass an in-memory backend.

export const createIndexedDbBackend = (factory = typeof indexedDB !== "undefined" ? indexedDB : null) => {
  let dbPromise = null;
  const open = () => {
    if (!factory) return Promise.reject(new Error("IndexedDB is not available."));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = factory.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
          if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) db.createObjectStore(PHOTO_STORE_NAME);
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
      const tx = db.transaction([STORE_NAME, PHOTO_STORE_NAME], mode);
      try {
        work(tx.objectStore(STORE_NAME), tx.objectStore(PHOTO_STORE_NAME));
      } catch (err) {
        try { tx.abort(); } catch { /* already finished */ }
        reject(err);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  };

  const readAll = (store, into) => {
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      if (typeof cursor.value === "string") into.set(String(cursor.key), cursor.value);
      cursor.continue();
    };
  };

  return {
    name: "indexeddb",
    async loadAll() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME, PHOTO_STORE_NAME], "readonly");
        const entries = new Map();
        const photos = new Map();
        readAll(tx.objectStore(STORE_NAME), entries);
        readAll(tx.objectStore(PHOTO_STORE_NAME), photos);
        tx.oncomplete = () => resolve({ entries, photos });
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB read aborted."));
      });
    },
    writeBatch({ puts = new Map(), deletes = new Set(), photoPuts = new Map(), photoDeletes = new Set() }) {
      return runTransaction("readwrite", (kv, photos) => {
        photoPuts.forEach((value, key) => photos.put(value, key));
        puts.forEach((value, key) => kv.put(value, key));
        deletes.forEach((key) => kv.delete(key));
        photoDeletes.forEach((key) => photos.delete(key));
      });
    },
    clear() {
      return runTransaction("readwrite", (kv, photos) => {
        kv.clear();
        photos.clear();
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

export const createMemoryBackend = (initial = {}, initialPhotos = {}) => {
  const data = new Map(Object.entries(initial));
  const photos = new Map(Object.entries(initialPhotos));
  return {
    name: "memory",
    data,
    photos,
    failNextWrite: null,
    async loadAll() {
      return { entries: new Map(data), photos: new Map(photos) };
    },
    async writeBatch({ puts = new Map(), deletes = new Set(), photoPuts = new Map(), photoDeletes = new Set() }) {
      if (this.failNextWrite) {
        const err = this.failNextWrite;
        this.failNextWrite = null;
        throw err;
      }
      photoPuts.forEach((value, key) => photos.set(key, value));
      puts.forEach((value, key) => data.set(key, value));
      deletes.forEach((key) => data.delete(key));
      photoDeletes.forEach((key) => photos.delete(key));
    },
    async clear() {
      data.clear();
      photos.clear();
    },
    async close() {},
  };
};

// ── The store ──────────────────────────────────────────────────────────────────────────────

export const createDeviceStore = ({ backend, localStorage: ls = getLocalStorage(), dispatch, idFactory } = {}) => {
  // "idb": cache backed by IndexedDB. "local": IndexedDB unavailable and the collection was
  // never moved, so behave exactly as before. "unavailable": moved, but IndexedDB will not
  // open; the app must not start (see MIGRATION_MARKER_KEY).
  let mode = "pending";
  let initError = null;
  const cache = new Map(); // key -> stored text, photos replaced by references
  const pool = createPhotoPool(idFactory ? { idFactory } : undefined);
  const dirty = new Set();
  const deleted = new Set();
  const pendingPhotoPuts = new Map(); // photos in the pool that have not reached IndexedDB
  const pendingPhotoDeletes = new Set();
  let flushTimer = null;
  let flushing = null;
  let retryIndex = 0;
  let lastFailure = null;
  let failureReported = false;
  let missingPhotos = 0;

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

  // Stores a value in the cache in its stored form. New photos join the pool now and are
  // written with the next flush.
  const putInCache = (key, text) => {
    const { text: stored, staged } = pool.externalize(text);
    staged.forEach((literal, id) => {
      pool.add(id, literal);
      pendingPhotoPuts.set(id, literal);
    });
    if (cache.get(key) === stored && !deleted.has(key)) return false;
    cache.set(key, stored);
    deleted.delete(key);
    dirty.add(key);
    return true;
  };

  // Photos no longer referenced by any stored value. Run before each write so a deleted
  // animal's photos leave the device with it.
  const collectUnreferencedPhotos = () => {
    const referenced = new Set();
    cache.forEach((text) => pool.refsIn(text, referenced));
    pool.ids().forEach((id) => {
      if (referenced.has(id)) return;
      pool.remove(id);
      if (pendingPhotoPuts.has(id)) pendingPhotoPuts.delete(id);
      else pendingPhotoDeletes.add(id);
    });
  };

  const hasPendingWork = () => dirty.size || deleted.size || pendingPhotoPuts.size || pendingPhotoDeletes.size;

  const flush = async () => {
    if (mode !== "idb") return true;
    if (flushing) {
      await flushing.catch(() => {});
      if (!hasPendingWork()) return true;
    }
    if (!hasPendingWork()) return true;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    collectUnreferencedPhotos();
    const puts = new Map();
    dirty.forEach((key) => {
      if (cache.has(key)) puts.set(key, cache.get(key));
    });
    const deletes = new Set(deleted);
    const photoPuts = new Map(pendingPhotoPuts);
    const photoDeletes = new Set(pendingPhotoDeletes);
    dirty.clear();
    deleted.clear();
    pendingPhotoPuts.clear();
    pendingPhotoDeletes.clear();
    flushing = backend.writeBatch({ puts, deletes, photoPuts, photoDeletes });
    try {
      await flushing;
      retryIndex = 0;
      lastFailure = null;
      failureReported = false;
      return true;
    } catch (err) {
      // Put the work back so the next attempt carries it, unless it changed again since.
      puts.forEach((_, key) => dirty.add(key));
      deletes.forEach((key) => {
        if (!cache.has(key)) deleted.add(key);
      });
      photoPuts.forEach((literal, id) => {
        if (pool.has(id)) pendingPhotoPuts.set(id, literal);
      });
      photoDeletes.forEach((id) => {
        if (!pool.has(id)) pendingPhotoDeletes.add(id);
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
    stored.photos.forEach((literal, id) => pool.add(id, literal));
    const loaded = new Map(stored.entries);

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
        await backend.writeBatch({ puts: pending });
        // Read it back before deleting the only other copy.
        const check = await backend.loadAll();
        const verified = [...pending].every(([key, value]) => check.entries.get(key) === value);
        if (!verified) throw new Error("Moved data did not read back intact.");
        pending.forEach((value, key) => loaded.set(key, value));
        pending.forEach((_, key) => {
          try { ls.removeItem(key); } catch { /* harmless: it is re-imported next time */ }
        });
      } catch (err) {
        // Keep using localStorage this session; the move is retried on the next launch.
        initError = err;
        mode = marker ? "unavailable" : "local";
        pool.clear();
        return status();
      }
    }

    // Values written before photos had their own table (or just moved from localStorage)
    // still carry them inline; the first flush rewrites them in the stored form.
    loaded.forEach((text, key) => {
      putInCache(key, text);
      // Already in the stored form: nothing to write.
      if (cache.get(key) === text) dirty.delete(key);
    });

    try {
      ls?.setItem?.(MIGRATION_MARKER_KEY, "idb");
    } catch {
      // Without the marker a later IndexedDB failure falls back to localStorage, which is the
      // old behaviour; nothing is lost by failing to write it.
    }
    mode = "idb";
    if (hasPendingWork()) scheduleFlush();
    return status();
  };

  const getItem = (key) => {
    if (mode === "idb" && isManagedKey(key)) {
      if (!cache.has(key)) return null;
      const { text, missing } = pool.rehydrate(cache.get(key));
      if (missing) {
        missingPhotos += missing;
        console.warn(`${missing} stored photo(s) for ${key} could not be found on this device.`);
      }
      return text;
    }
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
      if (putInCache(key, text) || pendingPhotoPuts.size) scheduleFlush();
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
    const texts = new Map(Object.entries(entries).map(([key, value]) => [key, String(value)]));
    if (mode === "idb") {
      const staged = new Map();
      const puts = new Map();
      texts.forEach((text, key) => puts.set(key, pool.externalize(text, staged).text));
      // A photo these values share with an unflushed change must be in the same transaction,
      // or a crash right after could leave a reference with nothing behind it.
      const photoPuts = new Map(staged);
      const referenced = new Set();
      puts.forEach((text) => pool.refsIn(text, referenced));
      referenced.forEach((id) => {
        if (pendingPhotoPuts.has(id)) photoPuts.set(id, pendingPhotoPuts.get(id));
      });
      await backend.writeBatch({ puts, photoPuts });
      staged.forEach((literal, id) => pool.add(id, literal));
      photoPuts.forEach((_, id) => pendingPhotoPuts.delete(id));
      puts.forEach((text, key) => {
        cache.set(key, text);
        dirty.delete(key);
        deleted.delete(key);
      });
      // The values these replaced may have been the last users of some photos.
      scheduleFlush();
      return;
    }
    // localStorage cannot do a transaction; write in order and put the old values back if
    // one fails, so a restore that does not fit leaves the device as it was.
    const previous = new Map();
    try {
      texts.forEach((value, key) => {
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
    pool.clear();
    dirty.clear();
    deleted.clear();
    pendingPhotoPuts.clear();
    pendingPhotoDeletes.clear();
    if (mode === "idb") await backend.clear();
  };

  // What each managed key takes in storage, largest first, with the photos table as one more
  // row. The text is ASCII JSON and base64, which IndexedDB and localStorage keep at about a
  // byte per character.
  const usage = () => {
    const rows = [];
    if (mode === "idb") {
      cache.forEach((text, key) => {
        if (text.length) rows.push({ key, bytes: text.length });
      });
      if (pool.size()) rows.push({ key: PHOTOS_USAGE_KEY, bytes: pool.totalChars() });
    } else {
      MANAGED_KEYS.forEach((key) => {
        const value = getItem(key);
        if (typeof value === "string" && value.length) rows.push({ key, bytes: value.length });
      });
    }
    return rows.sort((a, b) => b.bytes - a.bytes);
  };

  function status() {
    return {
      mode,
      backend: backend?.name || null,
      pendingWrites: dirty.size + deleted.size + pendingPhotoPuts.size + pendingPhotoDeletes.size,
      storedPhotos: pool.size(),
      missingPhotos,
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
