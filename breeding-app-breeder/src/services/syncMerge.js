// How two copies of one synced record become one.
//
// Every device keeps a full copy of the account and the server keeps another, so the same animal
// can be edited in two places before either side hears about the other. The old rule merged whole
// records by "newest wins" and combined every list from both sides. That lost one device's edit
// whenever two devices touched different fields of the same animal, and it made deletions
// impossible: a removed feed log, photo, tag or rack came straight back from whichever copy still
// held it.
//
// The rules here, mirrored line for line by breeding-app-backend/src/services/syncMerge.ts (a
// parity test runs both on the same cases):
//
// - Each top-level field carries its own edit time in `fieldUpdatedAt`. The later edit of a field
//   wins that field; the rest of the record is untouched. `fieldUpdatedAt['*']` is the time every
//   field not named in the map was last known good, so a field nobody edited is never mistaken for
//   a fresh one. A record without the map is a legacy record: its record time stands for every
//   field.
// - On a tie the existing (server) side wins. A tie means "no new information", typically a stale
//   copy being echoed back, and letting it win is how deleted genes used to return.
// - A side that does not carry a field does not delete it, unless that side stamped the field
//   later than the other: then the removal was an edit like any other.
// - Entries in nested lists (logs, photos, pairing locks, rooms) merge by identity, and a removed
//   entry leaves its key in `removedEntries` so the other copy cannot hand it back. An entry added
//   again after its removal (a later timestamp) is kept.
// - Edits are stamped when they are made, not when they sync, using a clock corrected against the
//   server's, so a device that was offline for a day does not "win" with a fresh sync-time stamp
//   and a device with a wrong clock does not decide the outcome.

import { hashString, logEntrySignature } from "./cloudSyncPayload";

// Fields the merge handles itself rather than as ordinary values.
// createdAt is bookkeeping too: the server adds it on read when a payload lacks it, and a
// creation time is never edited, so it must not count as a change.
const RESERVED_FIELDS = new Set(["fieldUpdatedAt", "removedEntries", "updatedAt", "createdAt", "metadata", "logs"]);

// Removal markers older than this are dropped. A device offline for longer than a year could hand
// a removed entry back; keeping markers forever would grow every record without bound.
const REMOVAL_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// JSON with object keys in sorted order. Postgres stores JSON with its own key order, so the same
// record read back compares unequal under plain JSON.stringify; every comparison of synced content
// uses this, or an untouched record looks edited on every round trip and is uploaded forever.
export function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  const sorted = {};
  Object.keys(value).sort().forEach(key => {
    if (value[key] !== undefined) sorted[key] = sortKeys(value[key]);
  });
  return sorted;
}


export const SYNC_ENTRY_ARRAYS = {
  animal: ["photos"],
  pairing: [
    "locks",
    "lockLogs",
    "appointments",
    "mobileOvulationLogs",
    "mobilePreLayShedLogs",
    "mobileClutchLogs",
    "mobileHatchLogs",
  ],
  planner: ["rooms", "heatRacks", "terrariums"],
};

// --- Clock ------------------------------------------------------------------------------------

let serverClockOffsetMs = 0;

// Records how far this device's clock is from the server's, from one request's round trip.
export function noteServerTime(serverTimeIso, requestStartedMs, requestEndedMs = Date.now()) {
  const serverMs = new Date(serverTimeIso || "").getTime();
  if (!Number.isFinite(serverMs) || !Number.isFinite(requestStartedMs)) return;
  const midpoint = requestStartedMs + (requestEndedMs - requestStartedMs) / 2;
  serverClockOffsetMs = Math.round(serverMs - midpoint);
}

export function getServerClockOffsetMs() {
  return serverClockOffsetMs;
}

export function setServerClockOffsetMs(value) {
  serverClockOffsetMs = Number.isFinite(value) ? value : 0;
}

// Now, on the server's clock as far as this device can tell.
export function syncNow() {
  return new Date(Date.now() + serverClockOffsetMs).toISOString();
}

// --- Timestamps -------------------------------------------------------------------------------

function timeOf(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function recordTime(record) {
  if (!record || typeof record !== "object") return 0;
  const metadata = record.metadata && typeof record.metadata === "object" ? record.metadata : {};
  return Math.max(
    timeOf(record.updatedAt),
    timeOf(record.modifiedAt),
    timeOf(record.lastModifiedAt),
    timeOf(metadata.updatedAt),
    timeOf(metadata.backendUpdatedAt),
    // Only when nothing else says when the record changed.
    record.updatedAt || record.modifiedAt || record.lastModifiedAt || metadata.updatedAt || metadata.backendUpdatedAt
      ? 0
      : timeOf(record.createdAt),
  );
}

function fieldMap(record) {
  const map = record && typeof record === "object" ? record.fieldUpdatedAt : null;
  return map && typeof map === "object" && !Array.isArray(map) ? map : null;
}

function baseTime(record) {
  const map = fieldMap(record);
  if (map && map["*"]) return timeOf(map["*"]);
  return recordTime(record);
}

export function fieldTime(record, key) {
  const map = fieldMap(record);
  if (map && map[key]) return timeOf(map[key]);
  return baseTime(record);
}

function isoOf(ms) {
  return ms > 0 ? new Date(ms).toISOString() : undefined;
}

// --- Entry identity ---------------------------------------------------------------------------

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function explicitEntryKey(entry, label) {
  return [
    entry.id,
    entry.logId,
    entry.uuid,
    entry.appId,
    entry.createdAt && `${entry.createdAt}:${entry.actionType || label}`,
    entry.addedAt && `${entry.addedAt}:${entry.source || label}`,
    entry.url,
  ].map(text).find(Boolean) || "";
}

function contentEntryKey(entry, label) {
  return `log-${hashString(logEntrySignature(entry, label))}`;
}

// Every key an entry may be known by. An entry that predates per-entry ids is known by its
// content-derived key, which is also the id backfillLogIds gives it, so a removal recorded on a
// device that had backfilled the id still matches the id-less copy on another.
export function entryKeys(entry, label) {
  if (!entry || typeof entry !== "object") return [];
  const keys = [];
  [entry.id, entry.logId, entry.uuid, entry.appId].map(text).filter(Boolean).forEach(key => keys.push(key));
  const explicit = explicitEntryKey(entry, label);
  if (explicit && !keys.includes(explicit)) keys.push(explicit);
  const content = contentEntryKey(entry, label);
  if (!keys.includes(content)) keys.push(content);
  return keys;
}

export function primaryEntryKey(entry, label) {
  return explicitEntryKey(entry, label) || contentEntryKey(entry, label);
}

function entryTime(entry) {
  return recordTime(entry) || timeOf(entry?.createdAt) || timeOf(entry?.addedAt);
}

function isRemoved(entry, label, removed) {
  if (!removed) return false;
  return entryKeys(entry, label).some(key => {
    if (!Object.prototype.hasOwnProperty.call(removed, key)) return false;
    // An entry that changed after it was removed was added back on purpose.
    return entryTime(entry) <= timeOf(removed[key]);
  });
}

// Merges two lists of entries by identity, newer copy of an entry winning, removed entries left out.
// `existing` is listed first so its order leads.
export function mergeEntryList(existing, incoming, label, removed = null, sorted = true) {
  const rows = [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ].filter(entry => entry && typeof entry === "object");
  // An id-less entry and an identical entry that has since been given an id are the same reading.
  const identified = new Set();
  rows.forEach(entry => {
    if (explicitEntryKey(entry, label)) identified.add(logEntrySignature(entry, label));
  });
  const merged = new Map();
  rows.forEach(entry => {
    if (!explicitEntryKey(entry, label) && identified.has(logEntrySignature(entry, label))) return;
    if (isRemoved(entry, label, removed)) return;
    const key = primaryEntryKey(entry, label);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, entry);
    } else if (entryTime(entry) > entryTime(current)) {
      merged.set(key, { ...current, ...entry });
    }
  });
  const result = Array.from(merged.values());
  // Newest first, as both sides have always stored logs and photos. Rooms and racks keep the
  // keeper's order.
  return sorted ? result.sort((a, b) => sortTime(b) - sortTime(a)) : result;
}

function sortTime(entry) {
  return entryTime(entry) || timeOf(entry?.date);
}

function mergeRemovedEntries(a, b, nowMs = Date.now()) {
  const result = {};
  [a, b].forEach(map => {
    if (!map || typeof map !== "object") return;
    Object.entries(map).forEach(([key, at]) => {
      const time = timeOf(at);
      if (!time || nowMs - time > REMOVAL_RETENTION_MS) return;
      if (!result[key] || timeOf(result[key]) < time) result[key] = new Date(time).toISOString();
    });
  });
  return result;
}

function mergeLogs(existingLogs, incomingLogs, removed) {
  const existing = existingLogs && typeof existingLogs === "object" ? existingLogs : {};
  const incoming = incomingLogs && typeof incomingLogs === "object" ? incomingLogs : {};
  const result = {};
  Array.from(new Set([...Object.keys(existing), ...Object.keys(incoming)])).forEach(key => {
    result[key] = mergeEntryList(existing[key], incoming[key], key, removed);
  });
  return result;
}

// --- Record merge -----------------------------------------------------------------------------

/**
 * Merges two copies of one record. `existing` is the server's copy (on the server, the stored row;
 * on a device, what the backend returned) and wins ties; `incoming` is the other device's.
 */
export function mergeSyncRecord(existing, incoming, options = {}) {
  const { entryArrays = [], mergeLogs: withLogs = false } = options;
  if (!existing || typeof existing !== "object") return incoming;
  if (!incoming || typeof incoming !== "object") return existing;
  const entryArraySet = new Set(entryArrays);
  const existingMap = fieldMap(existing);
  const incomingMap = fieldMap(incoming);
  const removed = mergeRemovedEntries(existing.removedEntries, incoming.removedEntries);

  const merged = {};
  const keys = Array.from(new Set([...Object.keys(existing), ...Object.keys(incoming)]));
  keys.forEach(key => {
    if (RESERVED_FIELDS.has(key)) return;
    if (entryArraySet.has(key)) {
      merged[key] = mergeEntryList(existing[key], incoming[key], key, removed, options.sortEntries !== false);
      return;
    }
    const incomingWins = fieldTime(incoming, key) > fieldTime(existing, key);
    const winner = incomingWins ? incoming : existing;
    const loser = incomingWins ? existing : incoming;
    if (winner[key] !== undefined) {
      merged[key] = winner[key];
    } else if (fieldMap(winner)?.[key]) {
      // The later side removed the field on purpose: it stamped the removal.
    } else if (loser[key] !== undefined) {
      merged[key] = loser[key];
    }
  });

  if (withLogs && (existing.logs || incoming.logs)) merged.logs = mergeLogs(existing.logs, incoming.logs, removed);
  const createdAt = existing.createdAt ?? incoming.createdAt;
  if (createdAt !== undefined) merged.createdAt = createdAt;

  const existingTime = recordTime(existing);
  const incomingTime = recordTime(incoming);
  const updatedAt = isoOf(Math.max(existingTime, incomingTime));
  if (updatedAt) merged.updatedAt = updatedAt;

  const existingMetadata = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : null;
  const incomingMetadata = incoming.metadata && typeof incoming.metadata === "object" ? incoming.metadata : null;
  if (existingMetadata || incomingMetadata) {
    merged.metadata = incomingTime > existingTime
      ? { ...(existingMetadata || {}), ...(incomingMetadata || {}) }
      : { ...(incomingMetadata || {}), ...(existingMetadata || {}) };
    if (updatedAt) merged.metadata.updatedAt = updatedAt;
  }

  if (existingMap || incomingMap) {
    const map = {};
    const base = Math.max(baseTime(existing), baseTime(incoming));
    if (base) map["*"] = new Date(base).toISOString();
    Array.from(new Set([...Object.keys(existingMap || {}), ...Object.keys(incomingMap || {})])).forEach(key => {
      if (key === "*") return;
      const time = Math.max(fieldTime(existing, key), fieldTime(incoming, key));
      if (time) map[key] = new Date(time).toISOString();
    });
    merged.fieldUpdatedAt = map;
  }
  if (Object.keys(removed).length) merged.removedEntries = removed;
  return merged;
}

// --- Stamping local edits ---------------------------------------------------------------------

function sameValue(a, b) {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}

function stampEntries(nextEntries, previousEntries, label, removed, now, stamped) {
  const next = Array.isArray(nextEntries) ? nextEntries : [];
  const previous = Array.isArray(previousEntries) ? previousEntries : [];
  const nextKeys = new Set();
  next.forEach(entry => entryKeys(entry, label).forEach(key => nextKeys.add(key)));
  previous.forEach(entry => {
    if (!entry || typeof entry !== "object") return;
    if (entryKeys(entry, label).some(key => nextKeys.has(key))) return;
    const key = primaryEntryKey(entry, label);
    if (removed[key]) return;
    removed[key] = now;
    stamped.now = true;
  });
  let changed = previous.length !== next.length;
  const previousByKey = new Map();
  previous.forEach(entry => {
    if (entry && typeof entry === "object") previousByKey.set(primaryEntryKey(entry, label), entry);
  });
  const entries = next.map(entry => {
    if (!entry || typeof entry !== "object") return entry;
    const before = previousByKey.get(primaryEntryKey(entry, label));
    if (!before) {
      changed = true;
      return entry;
    }
    if (sameValue(entryComparable(entry), entryComparable(before))) return entry;
    changed = true;
    // Already stamped when it was edited: that edit time stands.
    if (entryTime(entry) > entryTime(before)) return entry;
    // An edited entry carries its own edit time, so the other copy's older version loses.
    stamped.now = true;
    return { ...entry, updatedAt: now };
  });
  return { entries, changed };
}

function entryComparable(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const clone = { ...entry };
  delete clone.updatedAt;
  return clone;
}

/**
 * Stamps what changed between `previous` and `next` copies of one record: the edit time of every
 * changed field, and a removal marker for every entry that disappeared from a nested list. Returns
 * `next` untouched when nothing changed.
 */
export function stampRecordChanges(next, previous, { entryArrays = [], mergeLogs: withLogs = false, now = syncNow() } = {}) {
  if (!next || typeof next !== "object") return next;
  if (!previous || typeof previous !== "object") {
    if (fieldMap(next) && recordTime(next)) return next;
    return {
      ...next,
      updatedAt: now,
      fieldUpdatedAt: { ...(fieldMap(next) || {}), "*": now },
      metadata: { ...(next.metadata && typeof next.metadata === "object" ? next.metadata : {}), updatedAt: now },
    };
  }
  const entryArraySet = new Set(entryArrays);
  const removed = { ...(previous.removedEntries || {}), ...(next.removedEntries || {}) };
  const changedFields = [];
  // Whether anything got `now` as its edit time. When every change was already stamped at edit
  // time (the sync path re-stamping against the last synced copy), the record keeps its edit time
  // rather than taking the sync time: a record edited offline before another device deleted it
  // must not look edited after the deletion just because it synced later.
  const stamped = { now: false };
  let entriesChanged = false;
  const result = { ...next };
  const keys = Array.from(new Set([...Object.keys(next), ...Object.keys(previous)]));
  keys.forEach(key => {
    if (RESERVED_FIELDS.has(key)) return;
    if (entryArraySet.has(key)) {
      const { entries, changed } = stampEntries(next[key], previous[key], key, removed, now, stamped);
      if (changed) {
        result[key] = entries;
        entriesChanged = true;
      }
      return;
    }
    if (!sameValue(next[key], previous[key])) changedFields.push(key);
  });
  let logsChanged = false;
  if (withLogs) {
    const nextLogs = next.logs && typeof next.logs === "object" ? next.logs : {};
    const previousLogs = previous.logs && typeof previous.logs === "object" ? previous.logs : {};
    const logs = { ...nextLogs };
    Array.from(new Set([...Object.keys(nextLogs), ...Object.keys(previousLogs)])).forEach(key => {
      const { entries, changed } = stampEntries(nextLogs[key], previousLogs[key], key, removed, now, stamped);
      if (changed) {
        logs[key] = entries;
        logsChanged = true;
      }
    });
    if (logsChanged) result.logs = logs;
  }
  const removedChanged = !sameValue(removed, previous.removedEntries || {});
  if (!changedFields.length && !entriesChanged && !logsChanged && !removedChanged) return next;

  const map = { ...(fieldMap(previous) || {}), ...(fieldMap(next) || {}) };
  if (!map["*"]) {
    const base = recordTime(previous);
    if (base) map["*"] = new Date(base).toISOString();
  }
  changedFields.forEach(key => {
    // A field the caller already stamped later than the previous copy keeps that edit time.
    if (timeOf(fieldMap(next)?.[key]) > fieldTime(previous, key)) return;
    map[key] = now;
    stamped.now = true;
  });
  result.fieldUpdatedAt = map;
  if (Object.keys(removed).length) result.removedEntries = removed;
  const latest = stamped.now ? Math.max(timeOf(now), recordTime(next)) : recordTime(next);
  const updatedAt = new Date(latest).toISOString();
  result.updatedAt = updatedAt;
  result.metadata = { ...(next.metadata && typeof next.metadata === "object" ? next.metadata : {}), updatedAt };
  return result;
}

// --- Comparison -------------------------------------------------------------------------------

// A record's content without the bookkeeping that changes on every round trip.
export function syncContent(record) {
  if (!record || typeof record !== "object") return record;
  const clone = { ...record };
  delete clone.updatedAt;
  delete clone.modifiedAt;
  delete clone.lastModifiedAt;
  // Added on read from the row when the payload lacks it; a creation time never changes.
  delete clone.createdAt;
  delete clone.metadata;
  return clone;
}

export function sameSyncContent(a, b) {
  return stableStringify(syncContent(a)) === stableStringify(syncContent(b));
}
