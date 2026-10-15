/**
 * Sync helpers for the two new collections, `breedingCycles` and `follicleExams`.
 *
 * They follow the same pattern as pairings in App.jsx: a sanitizer, and a merge that takes the
 * newer record as the base and unions nested arrays by id so two devices adding entries to the
 * same card both keep theirs. Tombstones (`deletedAt`) win over live copies.
 */
import { normalizeCycle, reconcileMales } from './cycleModel';
import { normalizeExam } from './follicles';

const timestamp = (record) => {
  const candidates = [record?.updatedAt, record?.metadata?.updatedAt, record?.metadata?.backendUpdatedAt, record?.createdAt];
  for (const value of candidates) {
    const ms = value ? new Date(value).getTime() : NaN;
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
};

export function sanitizeBreedingCycleRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.deletedAt) return { id: String(raw.id || raw.appCycleId || '').trim(), deletedAt: raw.deletedAt, femaleId: raw.femaleId || null };
  const cycle = normalizeCycle(raw);
  return cycle.id && cycle.femaleId ? reconcileMales(cycle) : null;
}

export function sanitizeFollicleExamRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.deletedAt) return { id: String(raw.id || raw.appExamId || '').trim(), deletedAt: raw.deletedAt, femaleId: raw.femaleId || null };
  const exam = normalizeExam(raw);
  return exam.id && exam.femaleId ? exam : null;
}

function unionById(baseList = [], otherList = [], mergeItem = null) {
  const map = new Map();
  (Array.isArray(otherList) ? otherList : []).forEach((item) => { if (item?.id) map.set(item.id, item); });
  (Array.isArray(baseList) ? baseList : []).forEach((item) => {
    if (!item?.id) return;
    const existing = map.get(item.id);
    map.set(item.id, existing && mergeItem ? mergeItem(item, existing) : item);
  });
  return Array.from(map.values());
}

function mergeSession(base, other) {
  const newer = timestamp(base) >= timestamp(other) ? base : other;
  const older = newer === base ? other : base;
  return { ...older, ...newer, locks: unionById(newer.locks, older.locks) };
}

export function mergeBreedingCycleRecords(local, backend) {
  if (!local) return sanitizeBreedingCycleRecord(backend);
  if (!backend) return sanitizeBreedingCycleRecord(local);
  if (local.deletedAt || backend.deletedAt) return local.deletedAt ? local : backend;
  const localTime = timestamp(local);
  const backendTime = timestamp(backend);
  const base = backendTime > localTime ? backend : local;
  const other = base === backend ? local : backend;
  return sanitizeBreedingCycleRecord({
    ...other,
    ...base,
    males: unionById(base.males?.map((m) => ({ ...m, id: m.maleId })), other.males?.map((m) => ({ ...m, id: m.maleId }))).map(({ id, ...m }) => m),
    sessions: unionById(base.sessions, other.sessions, mergeSession),
    plannedPairings: unionById(base.plannedPairings, other.plannedPairings),
    events: unionById(base.events, other.events),
    // Removed on either copy stays removed; normalizeCycle drops these ids from the lists above.
    removedIds: [...(other.removedIds || []), ...(base.removedIds || [])],
    offspring: unionById(base.offspring?.map((o) => ({ ...o, id: o.animalId })), other.offspring?.map((o) => ({ ...o, id: o.animalId }))).map(({ id, ...o }) => o),
    reopenings: [...(other.reopenings || []), ...(base.reopenings || [])].filter((r, i, arr) => arr.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i),
  });
}

export function mergeFollicleExamRecords(local, backend) {
  if (!local) return sanitizeFollicleExamRecord(backend);
  if (!backend) return sanitizeFollicleExamRecord(local);
  if (local.deletedAt || backend.deletedAt) return local.deletedAt ? local : backend;
  const base = timestamp(backend) > timestamp(local) ? backend : local;
  const other = base === backend ? local : backend;
  return sanitizeFollicleExamRecord({
    ...other,
    ...base,
    measurements: unionById(base.measurements, other.measurements),
    attachments: unionById(base.attachments, other.attachments),
  });
}

/** Attachments can be large data URLs; the sync payload keeps a reference-sized copy. */
export function stripLargeAttachments(exam, { maxUrlLength = 200_000 } = {}) {
  if (!exam || !Array.isArray(exam.attachments)) return exam;
  const attachments = exam.attachments.map((a) => (
    a?.url && a.url.length > maxUrlLength ? { ...a, url: null, strippedForSync: true } : a
  ));
  return { ...exam, attachments };
}
