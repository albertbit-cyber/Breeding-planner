/**
 * Server-side rules for the two breeding collections carried by the cloud sync
 * (`breedingCycles`, `follicleExams`). The breeder app owns the records; this module keeps the
 * invariants that must hold across devices and accounts:
 *
 *  - every referenced animal (female, candidate male, offspring) belongs to the same owner;
 *  - one ACTIVE cycle per female: a duplicate arriving from a second device is paused and
 *    flagged for review, never silently merged and never allowed to fail the whole save;
 *  - nested arrays merge by id so two devices adding to one card both keep their entries;
 *  - the one automatic reminder (planned pairing follow-up) is queued at most once per planned
 *    entry and withdrawn when the entry is no longer pending.
 */
import { HttpError } from "../utils/errors";
import { env } from "../config/env";
import { enqueueEmail, cancelByIdempotencyKey } from "../email/queueService";
import { BREEDING_REMINDER_TEMPLATE_KEY, BREEDING_REMINDER_TEMPLATE_VERSION } from "../email/templates";
import { prisma } from "../lib/prisma";

type JsonRecord = Record<string, unknown>;

export const CYCLE_STATUSES = new Set(["active", "paused", "closed"]);
const LOCK_STATUSES = new Set(["observed", "not_observed", "unknown"]);
const EXAM_METHODS = new Set(["ultrasound", "palpation", "external"]);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const asRecord = (value: unknown): JsonRecord | null => (
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null
);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const out = String(value).trim();
  return out || null;
};
const ymd = (value: unknown): string | null => {
  const t = text(value);
  if (!t) return null;
  const head = t.slice(0, 10);
  return YMD.test(head) ? head : null;
};
const isoDate = (value: unknown): Date | null => {
  const t = text(value);
  if (!t) return null;
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d : null;
};
const timestampMs = (record: JsonRecord | null): number => {
  if (!record) return 0;
  const metadata = asRecord(record.metadata);
  return Math.max(
    isoDate(record.updatedAt)?.getTime() || 0,
    isoDate(metadata?.updatedAt)?.getTime() || 0,
    isoDate(metadata?.backendUpdatedAt)?.getTime() || 0,
    isoDate(record.createdAt)?.getTime() || 0,
  );
};

// ── Validation ────────────────────────────────────────────────────────────────

export const cycleAppId = (record: JsonRecord): string | null => text(record.id) || text(record.appCycleId);
export const examAppId = (record: JsonRecord): string | null => text(record.id) || text(record.appExamId);

/** Every animal a cycle names must be the owner's. Deleted animals still count: history is kept. */
export const validateBreedingReferences = (
  cycles: JsonRecord[],
  exams: JsonRecord[],
  knownAnimalAppIds: Set<string>,
): void => {
  const check = (animalAppId: string | null, where: string) => {
    if (!animalAppId) return;
    if (!knownAnimalAppIds.has(animalAppId)) {
      throw new HttpError(400, `${where} refers to animal "${animalAppId}", which is not in this account.`);
    }
  };
  cycles.forEach((cycle, index) => {
    if (cycle.deletedAt) return;
    const id = cycleAppId(cycle);
    if (!id) throw new HttpError(400, `breedingCycles[${index}] is missing an id.`);
    const femaleId = text(cycle.femaleId);
    if (!femaleId) throw new HttpError(400, `breedingCycles[${index}] is missing its female.`);
    check(femaleId, `breedingCycles[${index}].femaleId`);
    const status = text(cycle.status);
    if (status && !CYCLE_STATUSES.has(status)) throw new HttpError(400, `breedingCycles[${index}].status "${status}" is not valid.`);
    asArray(cycle.males).forEach((male) => check(text(asRecord(male)?.maleId), `breedingCycles[${index}].males`));
    asArray(cycle.sessions).forEach((session, sIndex) => {
      const s = asRecord(session);
      check(text(s?.maleId), `breedingCycles[${index}].sessions[${sIndex}]`);
      if (s && !ymd(s.introductionDate)) throw new HttpError(400, `breedingCycles[${index}].sessions[${sIndex}] needs an introduction date.`);
      asArray(s?.locks).forEach((lock, lIndex) => {
        const l = asRecord(lock);
        const lockStatus = text(l?.status);
        if (lockStatus && !LOCK_STATUSES.has(lockStatus)) throw new HttpError(400, `breedingCycles[${index}].sessions[${sIndex}].locks[${lIndex}].status "${lockStatus}" is not valid.`);
      });
    });
    asArray(cycle.plannedPairings).forEach((planned) => check(text(asRecord(planned)?.maleId), `breedingCycles[${index}].plannedPairings`));
    asArray(cycle.offspring).forEach((item) => {
      const o = asRecord(item);
      check(text(o?.animalId), `breedingCycles[${index}].offspring`);
      check(text(asRecord(o?.sireAssignment)?.maleId), `breedingCycles[${index}].offspring.sireAssignment`);
    });
    const clutch = asRecord(cycle.clutch);
    if (clutch) {
      ["eggsTotal", "fertileEggs", "slugs", "lostEggs", "hatchlingsRecorded"].forEach((key) => {
        const value = clutch[key];
        if (value === null || value === undefined || value === "") return;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `breedingCycles[${index}].clutch.${key} must be a non-negative count.`);
      });
    }
  });
  exams.forEach((exam, index) => {
    if (exam.deletedAt) return;
    const id = examAppId(exam);
    if (!id) throw new HttpError(400, `follicleExams[${index}] is missing an id.`);
    const femaleId = text(exam.femaleId);
    if (!femaleId) throw new HttpError(400, `follicleExams[${index}] is missing its female.`);
    check(femaleId, `follicleExams[${index}].femaleId`);
    if (!ymd(exam.date)) throw new HttpError(400, `follicleExams[${index}] needs an examination date.`);
    const method = text(exam.method);
    if (method && !EXAM_METHODS.has(method)) throw new HttpError(400, `follicleExams[${index}].method "${method}" is not valid.`);
    const diameter = exam.largestDiameterMm;
    if (diameter !== null && diameter !== undefined && diameter !== "") {
      const n = Number(diameter);
      if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `follicleExams[${index}].largestDiameterMm must be a positive number.`);
      if (method === "external") throw new HttpError(400, `follicleExams[${index}]: an external observation cannot carry a measured diameter.`);
    }
  });
};

// ── Columns ───────────────────────────────────────────────────────────────────

export const cycleColumns = (payload: JsonRecord) => {
  const closure = asRecord(payload.closure);
  const status = text(payload.status) && CYCLE_STATUSES.has(String(payload.status)) ? String(payload.status) : "active";
  return {
    femaleAnimalAppId: text(payload.femaleId) || "",
    seasonLabel: text(payload.seasonLabel),
    startDate: ymd(payload.startDate),
    status,
    closureOutcome: status === "closed" ? text(closure?.outcome) : null,
    closedAt: status === "closed" ? isoDate(closure?.closedAt) : null,
    multipleSires: payload.multipleSires === true,
  };
};

export const examColumns = (payload: JsonRecord) => {
  const diameter = payload.largestDiameterMm;
  const n = diameter === null || diameter === undefined || diameter === "" ? NaN : Number(diameter);
  return {
    femaleAnimalAppId: text(payload.femaleId) || "",
    cycleAppId: text(payload.cycleId),
    examDate: ymd(payload.date),
    method: text(payload.method),
    result: text(payload.result),
    largestDiameterMm: Number.isFinite(n) && n > 0 && text(payload.method) !== "external" ? n : null,
  };
};

// ── Merge ─────────────────────────────────────────────────────────────────────

const unionById = (older: unknown, newer: unknown, idKey = "id", mergeItem?: (a: JsonRecord, b: JsonRecord) => JsonRecord): JsonRecord[] => {
  const map = new Map<string, JsonRecord>();
  asArray(older).map(asRecord).forEach((item) => { const key = item && text(item[idKey]); if (item && key) map.set(key, item); });
  asArray(newer).map(asRecord).forEach((item) => {
    const key = item && text(item[idKey]);
    if (!item || !key) return;
    const existing = map.get(key);
    map.set(key, existing && mergeItem ? mergeItem(existing, item) : item);
  });
  return Array.from(map.values());
};

const mergeSession = (older: JsonRecord, newer: JsonRecord): JsonRecord => {
  const base = timestampMs(newer) >= timestampMs(older) ? newer : older;
  const other = base === newer ? older : newer;
  return { ...other, ...base, locks: unionById(other.locks, base.locks) };
};

/** Newer record wins scalars; nested arrays are unioned by id. Tombstones are handled by the caller. */
export const mergeBreedingCyclePayload = (existingPayload: unknown, incoming: JsonRecord): JsonRecord => {
  const existing = asRecord(existingPayload);
  if (!existing) return incoming;
  const incomingNewer = timestampMs(incoming) >= timestampMs(existing);
  const base = incomingNewer ? incoming : existing;
  const other = incomingNewer ? existing : incoming;
  return {
    ...other,
    ...base,
    males: unionById(other.males, base.males, "maleId"),
    sessions: unionById(other.sessions, base.sessions, "id", mergeSession),
    plannedPairings: unionById(other.plannedPairings, base.plannedPairings),
    events: unionById(other.events, base.events),
    offspring: unionById(other.offspring, base.offspring, "animalId"),
    metadata: { ...(asRecord(other.metadata) || {}), ...(asRecord(base.metadata) || {}) },
  };
};

export const mergeFollicleExamPayload = (existingPayload: unknown, incoming: JsonRecord): JsonRecord => {
  const existing = asRecord(existingPayload);
  if (!existing) return incoming;
  const incomingNewer = timestampMs(incoming) >= timestampMs(existing);
  const base = incomingNewer ? incoming : existing;
  const other = incomingNewer ? existing : incoming;
  return {
    ...other,
    ...base,
    measurements: unionById(other.measurements, base.measurements),
    attachments: unionById(other.attachments, base.attachments),
    metadata: { ...(asRecord(other.metadata) || {}), ...(asRecord(base.metadata) || {}) },
  };
};

// ── One active cycle per female ───────────────────────────────────────────────

/**
 * Given every live cycle payload an owner will hold after this save, return the payloads that
 * must change so that each female has at most one ACTIVE cycle. The cycle with the earliest
 * start date (then earliest createdAt, then id) stays active; the others are paused with a
 * review flag that names the kept card. Nothing is deleted or merged.
 */
export const resolveActiveCycleConflicts = (payloads: JsonRecord[], now = new Date().toISOString()): Map<string, JsonRecord> => {
  const changes = new Map<string, JsonRecord>();
  const byFemale = new Map<string, JsonRecord[]>();
  payloads.forEach((payload) => {
    if (payload.deletedAt || text(payload.status) !== "active") return;
    const femaleId = text(payload.femaleId);
    if (!femaleId) return;
    const list = byFemale.get(femaleId) || [];
    list.push(payload);
    byFemale.set(femaleId, list);
  });
  byFemale.forEach((list) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => (
      String(ymd(a.startDate) || "9999").localeCompare(String(ymd(b.startDate) || "9999"))
      || String(text(a.createdAt) || "").localeCompare(String(text(b.createdAt) || ""))
      || String(cycleAppId(a) || "").localeCompare(String(cycleAppId(b) || ""))
    ));
    const [kept, ...duplicates] = sorted;
    duplicates.forEach((payload) => {
      const id = cycleAppId(payload);
      if (!id) return;
      const flags = asArray(payload.reviewFlags).filter((flag) => text(asRecord(flag)?.kind) !== "duplicate_active_cycle");
      changes.set(id, {
        ...payload,
        status: "paused",
        pause: { pausedAt: now, reason: "duplicate_active_cycle" },
        reviewFlags: [...flags, { id: `dup-${id}`, kind: "duplicate_active_cycle", keptCycleId: cycleAppId(kept), raisedAt: now }],
        updatedAt: now,
        metadata: { ...(asRecord(payload.metadata) || {}), updatedAt: now },
      });
    });
  });
  return changes;
};

// ── Reminders ─────────────────────────────────────────────────────────────────

export const plannedPairingIdempotencyKey = (cycleAppId: string, plannedId: string): string =>
  `breeding_reminder:${cycleAppId}:planned_pairing:${plannedId}`;

const formatDateForTimezone = (isoDate: string, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "long", day: "numeric" }).format(new Date(`${isoDate}T12:00:00.000Z`));
  } catch {
    return isoDate;
  }
};

/**
 * Email is the one outbound channel the app has besides its own calendar. For every pending
 * planned pairing of an active cycle with a future date, one reminder job is queued (idempotent
 * on the planned entry's id); when the entry is done, skipped, cancelled, moved into the past,
 * or its cycle is paused or closed, the job is cancelled. Re-running on the same data is a no-op.
 */
export const syncPlannedPairingReminders = async (
  ownerId: string,
  cycles: JsonRecord[],
  animalNames: Map<string, string>,
  { today = new Date().toISOString().slice(0, 10) }: { today?: string } = {},
): Promise<{ queued: number; cancelled: number }> => {
  const db = prisma as any;
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  const preference = await db.notificationPreference.findUnique({
    where: { userId_category: { userId: ownerId, category: "breeding_reminders" } },
    select: { timezone: true, enabled: true },
  }).catch(() => null);
  const timezone = preference?.timezone || "UTC";
  let queued = 0;
  let cancelled = 0;
  for (const cycle of cycles) {
    const id = cycleAppId(cycle);
    if (!id) continue;
    const active = !cycle.deletedAt && text(cycle.status) === "active";
    const femaleName = animalNames.get(text(cycle.femaleId) || "") || "your female";
    for (const raw of asArray(cycle.plannedPairings)) {
      const planned = asRecord(raw);
      const plannedId = planned && text(planned.id);
      if (!planned || !plannedId) continue;
      const key = plannedPairingIdempotencyKey(id, plannedId);
      const date = ymd(planned.date);
      const pending = active && text(planned.status) === "pending" && !!date && date >= today;
      if (!pending || !owner?.email || preference?.enabled === false) {
        await cancelByIdempotencyKey(key);
        cancelled += 1;
        continue;
      }
      const maleName = animalNames.get(text(planned.maleId) || "") || "the planned male";
      await enqueueEmail({
        ownerId,
        recipientEmail: owner.email,
        category: "breeding_reminders",
        templateKey: BREEDING_REMINDER_TEMPLATE_KEY,
        templateVersion: BREEDING_REMINDER_TEMPLATE_VERSION,
        templatePayload: {
          animalDisplayName: femaleName,
          projectDisplayName: `Breeding card ${text(cycle.seasonLabel) || ""}`.trim(),
          reminderType: "pairing_follow_up",
          reminderDateDisplay: formatDateForTimezone(date as string, timezone),
          explanation: `A pairing with ${maleName} is planned for this date. It was proposed one calendar month after an observed lock, or set by you. Open the breeding card to record the session, move the date, or skip it.`,
          actionUrl: `${env.publicAppUrl || "https://app.breedingplanner.com"}/#/?focusCycle=${encodeURIComponent(id)}`,
        },
        subject: `Breeding reminder: planned pairing for ${femaleName}`,
        idempotencyKey: key,
        scheduledFor: new Date(`${date}T07:00:00.000Z`),
        relatedEntityType: "breeding_cycle",
        relatedEntityId: id,
      });
      queued += 1;
    }
  }
  return { queued, cancelled };
};
