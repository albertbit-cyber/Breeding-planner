/**
 * Read side of the breeding cards for the API. Every query is scoped by ownerId: a cycle,
 * examination, nested session, lock, planned pairing or offspring is only ever returned to the
 * account that owns it. The overview is built in two queries (cycles, examinations) and one
 * pass, never per row, so a large collection does not fan out into N+1 reads.
 */
import { prisma } from "../lib/prisma";

type JsonRecord = Record<string, unknown>;
const db = prisma as any;

const asRecord = (value: unknown): JsonRecord | null => (
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null
);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const out = String(value).trim();
  return out || null;
};

const withRowMetadata = (row: any): JsonRecord => {
  const payload = asRecord(row.payload) || {};
  return {
    ...payload,
    metadata: {
      ...(asRecord(payload.metadata) || {}),
      backendCreatedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      backendUpdatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    },
  };
};

export const listBreedingCycles = async (
  ownerId: string,
  { femaleAppId = null, status = null }: { femaleAppId?: string | null; status?: string | null } = {},
): Promise<JsonRecord[]> => {
  const rows = await db.breedingCycle.findMany({
    where: {
      ownerId,
      deletedAt: null,
      ...(femaleAppId ? { femaleAnimalAppId: femaleAppId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(withRowMetadata);
};

export const listFollicleExaminations = async (
  ownerId: string,
  { femaleAppId = null, cycleAppId = null }: { femaleAppId?: string | null; cycleAppId?: string | null } = {},
): Promise<JsonRecord[]> => {
  const rows = await db.follicleExamination.findMany({
    where: {
      ownerId,
      deletedAt: null,
      ...(femaleAppId ? { femaleAnimalAppId: femaleAppId } : {}),
      ...(cycleAppId ? { cycleAppId } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(withRowMetadata);
};

const compareDates = (a: unknown, b: unknown): number => String(text(a) || "").localeCompare(String(text(b) || ""));

export type BreedingOverviewRow = {
  cycleId: string;
  femaleAppId: string;
  seasonLabel: string | null;
  status: string;
  startDate: string | null;
  multipleSires: boolean;
  maleAppIds: string[];
  sessionCount: number;
  observedLockCount: number;
  latestIntroductionDate: string | null;
  latestObservedLockDate: string | null;
  nextPlannedPairing: { date: string; maleAppId: string | null } | null;
  latestExam: { date: string; method: string | null; result: string | null; largestDiameterMm: number | null; isEstimate: boolean } | null;
  nextReviewDate: string | null;
  milestones: Record<string, string>;
};

export const buildBreedingOverview = async (ownerId: string): Promise<{ rows: BreedingOverviewRow[]; generatedAt: string }> => {
  const [cycles, exams] = await Promise.all([
    db.breedingCycle.findMany({ where: { ownerId, deletedAt: null, status: { not: "closed" } }, orderBy: { updatedAt: "desc" } }),
    db.follicleExamination.findMany({ where: { ownerId, deletedAt: null }, orderBy: { examDate: "desc" } }),
  ]);
  const examsByFemale = new Map<string, any[]>();
  for (const exam of exams) {
    const list = examsByFemale.get(exam.femaleAnimalAppId) || [];
    list.push(exam);
    examsByFemale.set(exam.femaleAnimalAppId, list);
  }
  const rows: BreedingOverviewRow[] = cycles.map((row: any) => {
    const payload = asRecord(row.payload) || {};
    const sessions = asArray(payload.sessions).map(asRecord).filter((s): s is JsonRecord => !!s);
    let observedLockCount = 0;
    let latestObservedLockDate: string | null = null;
    let latestIntroductionDate: string | null = null;
    sessions.forEach((session) => {
      const intro = text(session.introductionDate);
      if (intro && (!latestIntroductionDate || intro > latestIntroductionDate)) latestIntroductionDate = intro;
      asArray(session.locks).map(asRecord).forEach((lock) => {
        if (!lock || text(lock.status) !== "observed") return;
        const date = text(lock.observationDate);
        if (!date) return;
        observedLockCount += 1;
        if (!latestObservedLockDate || date > latestObservedLockDate) latestObservedLockDate = date;
      });
    });
    const planned = asArray(payload.plannedPairings).map(asRecord)
      .filter((p): p is JsonRecord => !!p && text(p.status) === "pending" && !!text(p.date))
      .sort((a, b) => compareDates(a.date, b.date))[0] || null;
    const femaleExams = (examsByFemale.get(row.femaleAnimalAppId) || [])
      .filter((exam: any) => !exam.cycleAppId || exam.cycleAppId === row.appCycleId)
      .sort((a: any, b: any) => compareDates(b.examDate, a.examDate));
    const latest = femaleExams[0] || null;
    const latestPayload = latest ? asRecord(latest.payload) || {} : null;
    const milestones: Record<string, string> = {};
    asArray(payload.events).map(asRecord).forEach((event) => {
      if (!event || text(event.certainty) === "suspected") return;
      const type = text(event.type);
      const date = text(event.date);
      if (type && date && !milestones[type]) milestones[type] = date;
    });
    return {
      cycleId: row.appCycleId,
      femaleAppId: row.femaleAnimalAppId,
      seasonLabel: row.seasonLabel,
      status: row.status,
      startDate: row.startDate,
      multipleSires: row.multipleSires,
      maleAppIds: asArray(payload.males).map(asRecord).map((m) => text(m?.maleId)).filter((id): id is string => !!id),
      sessionCount: sessions.filter((s) => text(s.introductionDate)).length,
      observedLockCount,
      latestIntroductionDate,
      latestObservedLockDate,
      nextPlannedPairing: planned ? { date: text(planned.date) as string, maleAppId: text(planned.maleId) } : null,
      latestExam: latest ? {
        date: latest.examDate,
        method: latest.method,
        result: latest.result,
        largestDiameterMm: latest.largestDiameterMm,
        isEstimate: latest.method === "palpation",
      } : null,
      nextReviewDate: latestPayload ? text(latestPayload.nextReviewDate) : null,
      milestones,
    };
  });
  return { rows, generatedAt: new Date().toISOString() };
};
