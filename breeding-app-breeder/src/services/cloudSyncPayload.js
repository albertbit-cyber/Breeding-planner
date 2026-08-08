// Pure helpers for shaping what cloud sync sends and receives.
//
// Extracted from App.jsx so they can be tested directly: the bug that made an account's snapshot
// reach 20 MB lived in backfillLogIds and was invisible until someone measured the database.

export function getSyncTimestamp(value) {
  const candidates = [
    value?.updatedAt,
    value?.modifiedAt,
    value?.lastModifiedAt,
    value?.createdAt,
    value?.metadata?.updatedAt,
    value?.metadata?.modifiedAt,
    value?.metadata?.backendUpdatedAt,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const time = new Date(candidate).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

// Identity of a log entry that predates per-entry ids, derived from the fields a breeder fills in.
// Mirrors recordContentSignature in the backend's sync service so both sides agree on what counts
// as the same reading.
export function logEntrySignature(entry, label) {
  return [
    label,
    entry.date,
    entry.time,
    entry.result || entry.outcome,
    entry.feed || entry.food || entry.prey,
    entry.size || entry.weight || entry.grams,
    entry.notes || entry.note,
  ].map(part => (part === undefined || part === null ? '' : String(part))).join('|');
}

export function hashString(value) {
  // FNV-1a, enough to key a log entry and short enough to keep payloads small.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// Backfilled ids MUST be derived from the entry itself, never random. sanitizeSnakeRecord runs on
// every merge, and the server keeps id-less entries keyed by content -- so a random id here minted
// a brand-new "distinct" copy of the same reading on every single sync. One account reached
// 222,517 weight entries representing 116 real readings that way. A content-derived id is stable,
// so the same entry resolves to the same id on every device and every sync.
export function backfillLogIds(logs) {
  const result = {};
  for (const key of Object.keys(logs)) {
    const entries = logs[key];
    result[key] = Array.isArray(entries)
      ? entries.map(entry =>
        entry && typeof entry === 'object' && !entry.id
          ? { ...entry, id: `log-${hashString(logEntrySignature(entry, key))}` }
          : entry
      )
      : entries;
  }
  return result;
}

// --- Incremental cloud sync ----------------------------------------------------------------
// The snapshot endpoints used to move an account's entire dataset three times per sync: a full
// GET, a full PUT, and the full snapshot echoed back. These narrow each leg to what actually
// differs. Every one of them degrades to the old whole-account behaviour when anything is missing
// or inconsistent, because re-sending a record is free and skipping one loses data.

// Records worth uploading: absent from the server, or locally newer than the server's copy.
// `remoteRecords` is the client's model of server state, not the merge result.
export function selectRecordsToUpload(mergedRecords = [], remoteRecords = []) {
  const remoteById = new Map();
  (Array.isArray(remoteRecords) ? remoteRecords : []).forEach(record => {
    if (record && record.id) remoteById.set(record.id, record);
  });
  return (Array.isArray(mergedRecords) ? mergedRecords : []).filter(record => {
    if (!record || !record.id) return true;
    const remote = remoteById.get(record.id);
    if (!remote) return true;
    return getSyncTimestamp(record) > getSyncTimestamp(remote);
  });
}

// Applies deletions the backend reported for a delta window. A full snapshot conveys a deletion by
// omission; a delta has to name them, so they are removed here explicitly.
export function applyRemoteDeletions(snapshot = {}, deleted = null) {
  if (!deleted) return snapshot;
  const deadSnakes = new Set(Array.isArray(deleted.animals) ? deleted.animals : []);
  const deadPairings = new Set(Array.isArray(deleted.pairings) ? deleted.pairings : []);
  if (!deadSnakes.size && !deadPairings.size) return snapshot;
  return {
    ...snapshot,
    snakes: (snapshot.snakes || []).filter(record => !deadSnakes.has(record?.id)),
    pairings: (snapshot.pairings || []).filter(record => !deadPairings.has(record?.id)),
  };
}

// Overlays the server's canonical version of the records it just wrote onto the snapshot we
// already hold. Used with ?ack=changed, where the PUT returns only those records.
export function applyChangedRecords(snapshot = {}, changed = {}) {
  const overlay = (current = [], updates = []) => {
    if (!Array.isArray(updates) || !updates.length) return current;
    const byId = new Map((Array.isArray(current) ? current : []).map(record => [record?.id, record]));
    updates.forEach(record => {
      if (record && record.id) byId.set(record.id, record);
    });
    return [...byId.values()];
  };
  return {
    ...snapshot,
    snakes: overlay(snapshot.snakes, changed.snakes),
    pairings: overlay(snapshot.pairings, changed.pairings),
    plannerState: changed.plannerState || snapshot.plannerState,
  };
}
