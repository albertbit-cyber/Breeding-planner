// How two copies of one synced record become one, on the server.
//
// A line-for-line port of breeding-app-breeder/src/services/syncMerge.js, which explains the rules.
// The two must agree exactly: a device and the server that disagree about a merge produce two
// different "truths" for one animal, which is the mismatch this exists to end. The parity test in
// src/tests/syncMergeParity.test.ts runs both implementations on the same cases.

type JsonRecord = Record<string, any>;

// createdAt is bookkeeping too: the server adds it on read when a payload lacks it, and a
// creation time is never edited, so it must not count as a change.
const RESERVED_FIELDS = new Set(["fieldUpdatedAt", "removedEntries", "updatedAt", "createdAt", "metadata", "logs"]);
const REMOVAL_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

// JSON with object keys in sorted order. Postgres stores JSON with its own key order, so the same
// record read back compares unequal under plain JSON.stringify; every comparison of synced content
// uses this, or an untouched record looks edited on every round trip and is uploaded forever.
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  const sorted: Record<string, any> = {};
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

export type MergeOptions = { entryArrays?: string[]; mergeLogs?: boolean; sortEntries?: boolean };

const timeOf = (value: unknown): number => {
  if (!value) return 0;
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) ? time : 0;
};

export const recordTime = (record: unknown): number => {
  if (!record || typeof record !== "object") return 0;
  const value = record as JsonRecord;
  const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : {};
  return Math.max(
    timeOf(value.updatedAt),
    timeOf(value.modifiedAt),
    timeOf(value.lastModifiedAt),
    timeOf(metadata.updatedAt),
    timeOf(metadata.backendUpdatedAt),
    value.updatedAt || value.modifiedAt || value.lastModifiedAt || metadata.updatedAt || metadata.backendUpdatedAt
      ? 0
      : timeOf(value.createdAt),
  );
};

const fieldMap = (record: unknown): JsonRecord | null => {
  const map = record && typeof record === "object" ? (record as JsonRecord).fieldUpdatedAt : null;
  return map && typeof map === "object" && !Array.isArray(map) ? map : null;
};

const baseTime = (record: unknown): number => {
  const map = fieldMap(record);
  if (map && map["*"]) return timeOf(map["*"]);
  return recordTime(record);
};

export const fieldTime = (record: unknown, key: string): number => {
  const map = fieldMap(record);
  if (map && map[key]) return timeOf(map[key]);
  return baseTime(record);
};

const isoOf = (ms: number): string | undefined => (ms > 0 ? new Date(ms).toISOString() : undefined);

// Mirrors logEntrySignature and hashString in the breeder app's cloudSyncPayload.js.
export const logEntrySignature = (entry: JsonRecord, label: string): string => [
  label,
  entry.date,
  entry.time,
  entry.result || entry.outcome,
  entry.feed || entry.food || entry.prey,
  entry.size || entry.weight || entry.grams,
  entry.notes || entry.note,
].map((part) => (part === undefined || part === null ? "" : String(part))).join("|");

/**
 * One entry per content signature in every log list, keeping the entry with the smallest id.
 * Mirrors collapseDuplicateLogEntries in the breeder app's cloudSyncPayload.js, so a device and
 * the server keep the same survivor. Used by the full replace: a backup made before the
 * duplicated-log fix carries hundreds of thousands of copies of a hundred readings.
 */
export const collapseDuplicateLogEntries = (logs: unknown): unknown => {
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) return logs;
  const result: JsonRecord = {};
  Object.entries(logs as JsonRecord).forEach(([key, entries]) => {
    if (!Array.isArray(entries)) {
      result[key] = entries;
      return;
    }
    const survivorBySignature = new Map<string, JsonRecord>();
    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const signature = logEntrySignature(entry, key);
      const kept = survivorBySignature.get(signature);
      if (!kept || String(entry.id || "") < String(kept.id || "")) survivorBySignature.set(signature, entry);
    });
    const survivors = new Set(survivorBySignature.values());
    result[key] = entries.filter((entry) => !entry || typeof entry !== "object" || survivors.has(entry));
  });
  return result;
};

export const hashString = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const text = (value: unknown): string => (value === undefined || value === null ? "" : String(value).trim());

const explicitEntryKey = (entry: JsonRecord, label: string): string => [
  entry.id,
  entry.logId,
  entry.uuid,
  entry.appId,
  entry.createdAt && `${entry.createdAt}:${entry.actionType || label}`,
  entry.addedAt && `${entry.addedAt}:${entry.source || label}`,
  entry.url,
].map(text).find(Boolean) || "";

const contentEntryKey = (entry: JsonRecord, label: string): string => `log-${hashString(logEntrySignature(entry, label))}`;

export const entryKeys = (entry: unknown, label: string): string[] => {
  if (!entry || typeof entry !== "object") return [];
  const value = entry as JsonRecord;
  const keys: string[] = [];
  [value.id, value.logId, value.uuid, value.appId].map(text).filter(Boolean).forEach((key) => keys.push(key));
  const explicit = explicitEntryKey(value, label);
  if (explicit && !keys.includes(explicit)) keys.push(explicit);
  const content = contentEntryKey(value, label);
  if (!keys.includes(content)) keys.push(content);
  return keys;
};

export const primaryEntryKey = (entry: JsonRecord, label: string): string =>
  explicitEntryKey(entry, label) || contentEntryKey(entry, label);

const entryTime = (entry: JsonRecord): number => recordTime(entry) || timeOf(entry?.createdAt) || timeOf(entry?.addedAt);

const isRemoved = (entry: JsonRecord, label: string, removed: JsonRecord | null): boolean => {
  if (!removed) return false;
  return entryKeys(entry, label).some((key) => {
    if (!Object.prototype.hasOwnProperty.call(removed, key)) return false;
    return entryTime(entry) <= timeOf(removed[key]);
  });
};

export const mergeEntryList = (existing: unknown, incoming: unknown, label: string, removed: JsonRecord | null = null, sorted = true): JsonRecord[] => {
  const rows = [
    ...(Array.isArray(existing) ? existing : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ].filter((entry): entry is JsonRecord => !!entry && typeof entry === "object");
  const identified = new Set<string>();
  rows.forEach((entry) => {
    if (explicitEntryKey(entry, label)) identified.add(logEntrySignature(entry, label));
  });
  const merged = new Map<string, JsonRecord>();
  rows.forEach((entry) => {
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
};

const sortTime = (entry: JsonRecord): number => entryTime(entry) || timeOf(entry?.date);

const mergeRemovedEntries = (a: unknown, b: unknown, nowMs = Date.now()): JsonRecord => {
  const result: JsonRecord = {};
  [a, b].forEach((map) => {
    if (!map || typeof map !== "object") return;
    Object.entries(map as JsonRecord).forEach(([key, at]) => {
      const time = timeOf(at);
      if (!time || nowMs - time > REMOVAL_RETENTION_MS) return;
      if (!result[key] || timeOf(result[key]) < time) result[key] = new Date(time).toISOString();
    });
  });
  return result;
};

const mergeLogs = (existingLogs: unknown, incomingLogs: unknown, removed: JsonRecord): JsonRecord => {
  const existing = existingLogs && typeof existingLogs === "object" ? (existingLogs as JsonRecord) : {};
  const incoming = incomingLogs && typeof incomingLogs === "object" ? (incomingLogs as JsonRecord) : {};
  const result: JsonRecord = {};
  Array.from(new Set([...Object.keys(existing), ...Object.keys(incoming)])).forEach((key) => {
    result[key] = mergeEntryList(existing[key], incoming[key], key, removed);
  });
  return result;
};

/** Merges two copies of one record; `existing` (the stored row) wins ties. */
export const mergeSyncRecord = (existing: unknown, incoming: unknown, options: MergeOptions = {}): JsonRecord => {
  if (!existing || typeof existing !== "object") return incoming as JsonRecord;
  if (!incoming || typeof incoming !== "object") return existing as JsonRecord;
  const stored = existing as JsonRecord;
  const other = incoming as JsonRecord;
  const entryArraySet = new Set(options.entryArrays || []);
  const existingMap = fieldMap(stored);
  const incomingMap = fieldMap(other);
  const removed = mergeRemovedEntries(stored.removedEntries, other.removedEntries);

  const merged: JsonRecord = {};
  const keys = Array.from(new Set([...Object.keys(stored), ...Object.keys(other)]));
  keys.forEach((key) => {
    if (RESERVED_FIELDS.has(key)) return;
    if (entryArraySet.has(key)) {
      merged[key] = mergeEntryList(stored[key], other[key], key, removed, options.sortEntries !== false);
      return;
    }
    const incomingWins = fieldTime(other, key) > fieldTime(stored, key);
    const winner = incomingWins ? other : stored;
    const loser = incomingWins ? stored : other;
    if (winner[key] !== undefined) {
      merged[key] = winner[key];
    } else if (fieldMap(winner)?.[key]) {
      // The later side removed the field on purpose.
    } else if (loser[key] !== undefined) {
      merged[key] = loser[key];
    }
  });

  if (options.mergeLogs && (stored.logs || other.logs)) merged.logs = mergeLogs(stored.logs, other.logs, removed);
  const createdAt = stored.createdAt ?? other.createdAt;
  if (createdAt !== undefined) merged.createdAt = createdAt;

  const existingTime = recordTime(stored);
  const incomingTime = recordTime(other);
  const updatedAt = isoOf(Math.max(existingTime, incomingTime));
  if (updatedAt) merged.updatedAt = updatedAt;

  const existingMetadata = stored.metadata && typeof stored.metadata === "object" ? stored.metadata : null;
  const incomingMetadata = other.metadata && typeof other.metadata === "object" ? other.metadata : null;
  if (existingMetadata || incomingMetadata) {
    merged.metadata = incomingTime > existingTime
      ? { ...(existingMetadata || {}), ...(incomingMetadata || {}) }
      : { ...(incomingMetadata || {}), ...(existingMetadata || {}) };
    if (updatedAt) merged.metadata.updatedAt = updatedAt;
  }

  if (existingMap || incomingMap) {
    const map: JsonRecord = {};
    const base = Math.max(baseTime(stored), baseTime(other));
    if (base) map["*"] = new Date(base).toISOString();
    Array.from(new Set([...Object.keys(existingMap || {}), ...Object.keys(incomingMap || {})])).forEach((key) => {
      if (key === "*") return;
      const time = Math.max(fieldTime(stored, key), fieldTime(other, key));
      if (time) map[key] = new Date(time).toISOString();
    });
    merged.fieldUpdatedAt = map;
  }
  if (Object.keys(removed).length) merged.removedEntries = removed;
  return merged;
};

/**
 * Stamps a server-side edit (a lab result, a sale) the way a device stamps its own: the named
 * fields get `at` as their edit time, so a device's older copy of those fields loses to them.
 */
export const stampServerEdit = (payload: JsonRecord, fields: string[], at: string, rowUpdatedAt?: unknown): JsonRecord => {
  const map = { ...(fieldMap(payload) || {}) };
  if (!map["*"]) {
    // Devices read the row with its write time as the record time, so that is what every field
    // not stamped here was last known good at.
    const base = Math.max(recordTime(payload), timeOf(rowUpdatedAt));
    if (base) map["*"] = new Date(base).toISOString();
  }
  fields.forEach((field) => {
    map[field] = at;
  });
  const updatedAt = new Date(Math.max(timeOf(at), recordTime(payload))).toISOString();
  const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  return { ...payload, fieldUpdatedAt: map, updatedAt, metadata: { ...metadata, updatedAt } };
};

/** A record's content without the bookkeeping that changes on every round trip. */
export const syncContent = (record: unknown): unknown => {
  if (!record || typeof record !== "object") return record;
  const clone: JsonRecord = { ...(record as JsonRecord) };
  delete clone.updatedAt;
  delete clone.modifiedAt;
  delete clone.lastModifiedAt;
  // Added on read from the row when the payload lacks it; a creation time never changes.
  delete clone.createdAt;
  delete clone.metadata;
  return clone;
};

export const sameSyncContent = (a: unknown, b: unknown): boolean =>
  stableStringify(syncContent(a)) === stableStringify(syncContent(b));

/**
 * Serializes every write to one account's synced data. Two devices saving at once used to read the
 * same stored row, merge against it separately and write in turn, so the second write silently
 * dropped whatever the first had added (a phone's feed log, a lab result). Taken inside the
 * transaction, released when it ends.
 */
export const lockBreederAccount = async (tx: any, ownerId: string): Promise<void> => {
  if (typeof tx?.$executeRaw !== "function") return;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`breeder-sync:${ownerId}`}))`;
};
