import { prisma } from "../lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

export type LockEventOut = {
  id: string;
  lockDate: string;
  cycleId: string | null;
  sourceType: string;
  notes: string | null;
};

export type CycleIntervals = {
  lockCount: number;
  firstLockDate: string | null;
  lastLockDate: string | null;
  avgDaysBetweenLocks: number | null;
  firstLockToOvulation: number | null;
  lastLockToOvulation: number | null;
  ovulationToPreLayShed: number | null;
  preLayShedToEggLaying: number | null;
  ovulationToEggLaying: number | null;
  pairingStartToEggLaying: number | null;
  fertilityRate: number | null;
};

export type ReproductiveCycleOut = {
  id: string;
  season: number;
  cycleIndex: number;
  maleAppId: string | null;
  pairingAppId: string | null;
  pairingStartDate: string | null;
  pairingEndDate: string | null;
  ovulationDate: string | null;
  preLayShedDate: string | null;
  eggLayingDate: string | null;
  eggCount: number | null;
  fertileCount: number | null;
  slugCount: number | null;
  notes: string | null;
  locks: LockEventOut[];
  intervals: CycleIntervals;
};

export type PredictionWindow = {
  earliest: string;
  average: string;
  latest: string;
};

export type ReproductivePredictions = {
  source: "personal" | "collection" | "species_default";
  confidence: "none" | "low" | "medium" | "high";
  basedOnCycles: number;
  fromOvulation: {
    preLayShed: PredictionWindow | null;
    eggLaying: PredictionWindow | null;
  } | null;
  fromPreLayShed: {
    eggLaying: PredictionWindow | null;
  } | null;
  nextLockEstimate: {
    window: PredictionWindow | null;
    avgLocksBeforeOvulation: number | null;
  } | null;
};

export type LifetimeAnalytics = {
  totalCycles: number;
  totalLifetimeLocks: number;
  avgLocksPerCycle: number | null;
  avgDaysBetweenLocks: number | null;
  avgFirstLockToOvulation: number | null;
  avgLastLockToOvulation: number | null;
  avgOvulationToPreLayShed: number | null;
  avgPreLayShedToEggLaying: number | null;
  avgOvulationToEggLaying: number | null;
  avgFertilityRate: number | null;
  confidence: "none" | "low" | "medium" | "high";
  patternTags: string[];
};

export type FemaleReproductiveProfile = {
  femaleAppId: string;
  cycles: ReproductiveCycleOut[];
  analytics: LifetimeAnalytics;
  predictions: ReproductivePredictions;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function textVal(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
}

function numVal(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysBetween(d1: string, d2: string): number | null {
  const a = new Date(d1).getTime();
  const b = new Date(d2).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function roundTo2(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100) / 100;
}

// Ball python species defaults used as last-resort fallback
const SPECIES_DEFAULTS = {
  ovulationToPreLayShed: { min: 14, avg: 18, max: 25 },
  preLayShedToEggLaying: { min: 27, avg: 30, max: 35 },
  ovulationToEggLaying:  { min: 42, avg: 49, max: 58 },
  firstLockToOvulation:  { min: 21, avg: 45, max: 90 },
} as const;

function confidenceLevel(cycleCount: number): "none" | "low" | "medium" | "high" {
  if (cycleCount === 0) return "none";
  if (cycleCount === 1) return "low";
  if (cycleCount <= 3) return "medium";
  return "high";
}

function buildWindow(
  values: number[],
  refDate: string
): PredictionWindow | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    earliest: addDays(refDate, sorted[0]),
    average:  addDays(refDate, avg),
    latest:   addDays(refDate, sorted[sorted.length - 1]),
  };
}

function buildWindowFromDefault(
  def: { min: number; avg: number; max: number },
  refDate: string
): PredictionWindow {
  return {
    earliest: addDays(refDate, def.min),
    average:  addDays(refDate, def.avg),
    latest:   addDays(refDate, def.max),
  };
}

// ── Per-cycle interval calculation ────────────────────────────────────────────

function calcIntervals(cycle: any, locks: any[]): CycleIntervals {
  const dates = locks.map((l) => l.lockDate as string).sort();
  const firstLock = dates[0] ?? null;
  const lastLock  = dates[dates.length - 1] ?? null;

  const lockIntervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const d = daysBetween(dates[i - 1], dates[i]);
    if (d !== null && d > 0) lockIntervals.push(d);
  }

  const fertility =
    cycle.eggCount && cycle.fertileCount !== null && cycle.eggCount > 0
      ? (cycle.fertileCount as number) / (cycle.eggCount as number)
      : null;

  return {
    lockCount:               dates.length,
    firstLockDate:           firstLock,
    lastLockDate:            lastLock,
    avgDaysBetweenLocks:     roundTo2(mean(lockIntervals)),
    firstLockToOvulation:    cycle.ovulationDate && firstLock ? daysBetween(firstLock, cycle.ovulationDate) : null,
    lastLockToOvulation:     cycle.ovulationDate && lastLock  ? daysBetween(lastLock, cycle.ovulationDate)  : null,
    ovulationToPreLayShed:   cycle.ovulationDate && cycle.preLayShedDate ? daysBetween(cycle.ovulationDate, cycle.preLayShedDate) : null,
    preLayShedToEggLaying:   cycle.preLayShedDate && cycle.eggLayingDate ? daysBetween(cycle.preLayShedDate, cycle.eggLayingDate) : null,
    ovulationToEggLaying:    cycle.ovulationDate && cycle.eggLayingDate  ? daysBetween(cycle.ovulationDate, cycle.eggLayingDate)  : null,
    pairingStartToEggLaying: cycle.pairingStartDate && cycle.eggLayingDate ? daysBetween(cycle.pairingStartDate, cycle.eggLayingDate) : null,
    fertilityRate:           roundTo2(fertility),
  };
}

// ── Pattern classification ────────────────────────────────────────────────────

async function classifyPatterns(
  femaleAnimalId: string,
  ownerId: string,
  analytics: Omit<LifetimeAnalytics, "patternTags">
): Promise<string[]> {
  const tags: string[] = [];
  if (analytics.totalCycles < 2) return tags;

  // Compare against collection averages for all females in the same collection
  const collCycles = await (prisma as any).reproductiveCycle.findMany({
    where: { ownerId, femaleAnimalId: { not: femaleAnimalId } },
    include: { locks: true },
  });

  const collIntervals = collCycles.map((c: any) => calcIntervals(c, c.locks));

  const collAvgFLO = mean(collIntervals.map((i: CycleIntervals) => i.firstLockToOvulation).filter((v: number | null): v is number => v !== null));
  const collAvgLPCycle = mean(collIntervals.map((i: CycleIntervals) => i.lockCount));
  const collAvgPairingToLay = mean(collIntervals.map((i: CycleIntervals) => i.pairingStartToEggLaying).filter((v: number | null): v is number => v !== null));

  if (analytics.avgFirstLockToOvulation !== null && collAvgFLO !== null) {
    if (analytics.avgFirstLockToOvulation < collAvgFLO * 0.8) tags.push("early_ovulator");
    else if (analytics.avgFirstLockToOvulation > collAvgFLO * 1.2) tags.push("late_ovulator");
  }

  if (analytics.avgLocksPerCycle !== null && collAvgLPCycle !== null) {
    if (analytics.avgLocksPerCycle > collAvgLPCycle * 1.3) tags.push("frequent_locker");
    else if (analytics.avgLocksPerCycle < collAvgLPCycle * 0.7) tags.push("infrequent_locker");
  }

  // Consistency: low std deviation in key metric
  const cycles = await (prisma as any).reproductiveCycle.findMany({
    where: { femaleAnimalId },
    include: { locks: true },
  });
  const ovToLayValues = cycles
    .map((c: any) => calcIntervals(c, c.locks).ovulationToEggLaying)
    .filter((v: number | null): v is number => v !== null);
  if (ovToLayValues.length >= 3) {
    const avg = mean(ovToLayValues) as number;
    const variance = mean(ovToLayValues.map((v: number) => Math.pow(v - avg, 2))) as number;
    const stdDev = Math.sqrt(variance);
    if (stdDev <= 3) tags.push("consistent");
    else if (stdDev >= 8) tags.push("variable");
  }

  return tags;
}

// ── Lifetime analytics ────────────────────────────────────────────────────────

async function buildLifetimeAnalytics(
  femaleAnimalId: string,
  ownerId: string,
  cycles: any[],
  allLocks: any[]
): Promise<LifetimeAnalytics> {
  const locksByCycle = new Map<string, any[]>();
  for (const lock of allLocks) {
    const arr = locksByCycle.get(lock.cycleId ?? "__none") ?? [];
    arr.push(lock);
    locksByCycle.set(lock.cycleId ?? "__none", arr);
  }

  const intervalsByCycle = cycles.map((c) => calcIntervals(c, locksByCycle.get(c.id) ?? []));

  const pick = <K extends keyof CycleIntervals>(key: K): number[] =>
    intervalsByCycle.map((i) => i[key] as number | null).filter((v): v is number => v !== null);

  const locksPerCycle = intervalsByCycle.map((i) => i.lockCount);
  const fertility = pick("fertilityRate");

  const analytics: Omit<LifetimeAnalytics, "patternTags"> = {
    totalCycles:              cycles.length,
    totalLifetimeLocks:       allLocks.length,
    avgLocksPerCycle:         roundTo2(mean(locksPerCycle)),
    avgDaysBetweenLocks:      roundTo2(mean(pick("avgDaysBetweenLocks"))),
    avgFirstLockToOvulation:  roundTo2(mean(pick("firstLockToOvulation"))),
    avgLastLockToOvulation:   roundTo2(mean(pick("lastLockToOvulation"))),
    avgOvulationToPreLayShed: roundTo2(mean(pick("ovulationToPreLayShed"))),
    avgPreLayShedToEggLaying: roundTo2(mean(pick("preLayShedToEggLaying"))),
    avgOvulationToEggLaying:  roundTo2(mean(pick("ovulationToEggLaying"))),
    avgFertilityRate:         roundTo2(mean(fertility)),
    confidence:               confidenceLevel(cycles.length),
  };

  const patternTags = await classifyPatterns(femaleAnimalId, ownerId, analytics);

  return { ...analytics, patternTags };
}

// ── Prediction engine ─────────────────────────────────────────────────────────

async function buildPredictions(
  femaleAnimalId: string,
  ownerId: string,
  analytics: LifetimeAnalytics,
  cycles: any[],
  allLocks: any[]
): Promise<ReproductivePredictions> {
  const confidence = analytics.confidence;
  const activeCycle = cycles.find((c) => !c.eggLayingDate) ?? null;

  // Choose source tier
  let source: "personal" | "collection" | "species_default" = "species_default";
  let ov2shed: number[] = [];
  let shed2lay: number[] = [];
  let ov2lay:   number[] = [];
  let flo:      number[] = [];

  const locksByCycle = new Map<string, any[]>();
  for (const lock of allLocks) {
    const arr = locksByCycle.get(lock.cycleId ?? "__none") ?? [];
    arr.push(lock);
    locksByCycle.set(lock.cycleId ?? "__none", arr);
  }

  if (cycles.length >= 1) {
    source = "personal";
    for (const c of cycles) {
      const intervals = calcIntervals(c, locksByCycle.get(c.id) ?? []);
      if (intervals.ovulationToPreLayShed !== null) ov2shed.push(intervals.ovulationToPreLayShed);
      if (intervals.preLayShedToEggLaying !== null) shed2lay.push(intervals.preLayShedToEggLaying);
      if (intervals.ovulationToEggLaying  !== null) ov2lay.push(intervals.ovulationToEggLaying);
      if (intervals.firstLockToOvulation  !== null) flo.push(intervals.firstLockToOvulation);
    }
  }

  // Fall back to collection-level data if personal data is insufficient
  if (!ov2shed.length || !shed2lay.length) {
    const collCycles = await (prisma as any).reproductiveCycle.findMany({
      where: { ownerId, femaleAnimalId: { not: femaleAnimalId } },
      include: { locks: true },
    });
    if (collCycles.length > 0) {
      source = ov2shed.length ? "personal" : "collection";
      for (const c of collCycles) {
        const intervals = calcIntervals(c, c.locks);
        if (!ov2shed.length && intervals.ovulationToPreLayShed !== null) ov2shed.push(intervals.ovulationToPreLayShed);
        if (!shed2lay.length && intervals.preLayShedToEggLaying !== null) shed2lay.push(intervals.preLayShedToEggLaying);
        if (!ov2lay.length  && intervals.ovulationToEggLaying  !== null) ov2lay.push(intervals.ovulationToEggLaying);
        if (!flo.length     && intervals.firstLockToOvulation  !== null) flo.push(intervals.firstLockToOvulation);
      }
    }
  }

  // Build prediction windows based on active cycle state
  const refOvulation  = activeCycle?.ovulationDate ?? null;
  const refShed       = activeCycle?.preLayShedDate ?? null;

  const fromOvulation = refOvulation ? {
    preLayShed: ov2shed.length
      ? buildWindow(ov2shed, refOvulation)
      : buildWindowFromDefault(SPECIES_DEFAULTS.ovulationToPreLayShed, refOvulation),
    eggLaying: ov2lay.length
      ? buildWindow(ov2lay, refOvulation)
      : buildWindowFromDefault(SPECIES_DEFAULTS.ovulationToEggLaying, refOvulation),
  } : null;

  const fromPreLayShed = refShed ? {
    eggLaying: shed2lay.length
      ? buildWindow(shed2lay, refShed)
      : buildWindowFromDefault(SPECIES_DEFAULTS.preLayShedToEggLaying, refShed),
  } : null;

  const avgLocksBeforeOvulation = analytics.avgLocksPerCycle;

  return {
    source,
    confidence,
    basedOnCycles: cycles.length,
    fromOvulation,
    fromPreLayShed,
    nextLockEstimate: {
      window: null, // populated when lock-based prediction is active
      avgLocksBeforeOvulation,
    },
  };
}

// ── Data extraction from Pairing.payload ──────────────────────────────────────

function extractLockDates(pairing: JsonRecord): string[] {
  const appointments = Array.isArray(pairing.appointments) ? pairing.appointments : [];
  const dates: string[] = [];
  for (const apt of appointments as JsonRecord[]) {
    const observed = apt.lockObserved === true;
    const rawDate =
      textVal(apt.lockDate) ||
      textVal(apt.lockLoggedAt) ||
      (observed ? textVal(apt.date) : null);
    if (rawDate) dates.push(rawDate.slice(0, 10));
  }
  return [...new Set(dates)]; // deduplicate within one pairing
}

function extractOvulationDate(pairing: JsonRecord): string | null {
  const ov = pairing.ovulation as JsonRecord | null;
  if (!ov || !ov.observed || !ov.date) return null;
  return textVal(ov.date)?.slice(0, 10) ?? null;
}

function extractPreLayShedDate(pairing: JsonRecord): string | null {
  const shed = pairing.preLayShed as JsonRecord | null;
  if (!shed || !shed.observed || !shed.date) return null;
  return textVal(shed.date)?.slice(0, 10) ?? null;
}

// ── Core ingestion (called from upsertBreederSnapshot) ────────────────────────

/**
 * For every pairing that has a female, extract reproductive events and
 * upsert them into ReproductiveCycle + LockEvent tables.
 * Called after the main transaction so Animal/Pairing rows already exist.
 */
export async function ingestAllPairingsIntoReproductiveCycles(
  ownerId: string,
  pairings: JsonRecord[],
  clutches: JsonRecord[]
): Promise<void> {
  const db = prisma as any;

  // Index clutches by pairingAppId for O(1) lookup
  const clutchByPairingId = new Map<string, JsonRecord>();
  for (const c of clutches) {
    const pid = textVal(c.pairingAppId) || textVal(c.pairingId);
    if (pid) clutchByPairingId.set(pid, c);
  }

  for (const pairing of pairings) {
    const femaleAppId = textVal(pairing.femaleId);
    if (!femaleAppId) continue;

    const maleAppId    = textVal(pairing.maleId);
    const pairingAppId = textVal(pairing.id) || textVal(pairing.appPairingId);
    const startDate    = textVal(pairing.startDate);
    const season       = startDate ? parseInt(startDate.slice(0, 4), 10) : new Date().getFullYear();

    // Resolve DB rows
    const femaleAnimal = await db.animal.findFirst({
      where: { ownerId, appAnimalId: femaleAppId },
      select: { id: true },
    });
    if (!femaleAnimal) continue;

    const maleAnimal = maleAppId
      ? await db.animal.findFirst({ where: { ownerId, appAnimalId: maleAppId }, select: { id: true } })
      : null;

    const pairingRow = pairingAppId
      ? await db.pairing.findFirst({ where: { ownerId, appPairingId: pairingAppId }, select: { id: true } })
      : null;

    const clutch = pairingAppId ? clutchByPairingId.get(pairingAppId) ?? null : null;

    const ovulationDate  = extractOvulationDate(pairing);
    const preLayShedDate = extractPreLayShedDate(pairing);
    const rawLayDate     = clutch ? textVal(clutch.date) || textVal(clutch.laidDate) : null;
    const eggLayingDate  = rawLayDate ? rawLayDate.slice(0, 10) : null;
    const eggCount       = clutch ? numVal(clutch.eggsTotal) : null;
    const fertileCount   = clutch ? numVal(clutch.fertileEggs) : null;
    const slugCount      = clutch ? numVal(clutch.slugs) : null;

    // Find existing cycle for this pairing
    let cycle = pairingRow?.id
      ? await db.reproductiveCycle.findFirst({ where: { pairingId: pairingRow.id } })
      : null;

    if (!cycle) {
      const existingCount = await db.reproductiveCycle.count({
        where: { femaleAnimalId: femaleAnimal.id, season },
      });
      cycle = await db.reproductiveCycle.create({
        data: {
          ownerId,
          femaleAnimalId: femaleAnimal.id,
          femaleAppId,
          maleAnimalId:   maleAnimal?.id ?? null,
          maleAppId:      maleAppId ?? null,
          pairingId:      pairingRow?.id ?? null,
          pairingAppId:   pairingAppId ?? null,
          season,
          cycleIndex:     existingCount + 1,
          pairingStartDate: startDate,
          ovulationDate,
          preLayShedDate,
          eggLayingDate,
          eggCount,
          fertileCount,
          slugCount,
        },
      });
    } else {
      // Update dates that may have changed
      await db.reproductiveCycle.update({
        where: { id: cycle.id },
        data: {
          maleAnimalId:   maleAnimal?.id ?? undefined,
          maleAppId:      maleAppId ?? undefined,
          ovulationDate:  ovulationDate ?? undefined,
          preLayShedDate: preLayShedDate ?? undefined,
          eggLayingDate:  eggLayingDate ?? undefined,
          eggCount:       eggCount ?? undefined,
          fertileCount:   fertileCount ?? undefined,
          slugCount:      slugCount ?? undefined,
        },
      });
    }

    // Ingest lock events (upsert with dedup on femaleAnimalId + lockDate)
    const lockDates = extractLockDates(pairing);
    for (const lockDate of lockDates) {
      await db.lockEvent.upsert({
        where: { femaleAnimalId_lockDate: { femaleAnimalId: femaleAnimal.id, lockDate } },
        create: {
          ownerId,
          femaleAnimalId: femaleAnimal.id,
          femaleAppId,
          cycleId:    cycle.id,
          lockDate,
          sourceType: "pairing_calendar",
          sourceId:   pairingAppId ?? null,
        },
        update: {
          cycleId: cycle.id,
        },
      });
    }

    // Rebuild analytics cache for this female
    await rebuildAnalyticsCache(femaleAnimal.id, femaleAppId, ownerId);
  }
}

// ── Analytics cache rebuild ───────────────────────────────────────────────────

async function rebuildAnalyticsCache(
  femaleAnimalId: string,
  femaleAppId: string,
  ownerId: string
): Promise<void> {
  const db = prisma as any;
  const cycles  = await db.reproductiveCycle.findMany({ where: { femaleAnimalId }, include: { locks: true } });
  const allLocks = cycles.flatMap((c: any) => c.locks as any[]);

  const analytics = await buildLifetimeAnalytics(femaleAnimalId, ownerId, cycles, allLocks);

  await db.reproductiveAnalyticsCache.upsert({
    where: { femaleAnimalId },
    create: {
      femaleAnimalId,
      femaleAppId,
      ownerId,
      totalCycles:              analytics.totalCycles,
      avgLocksPerCycle:         analytics.avgLocksPerCycle,
      avgDaysBetweenLocks:      analytics.avgDaysBetweenLocks,
      avgFirstLockToOvulation:  analytics.avgFirstLockToOvulation,
      avgLastLockToOvulation:   analytics.avgLastLockToOvulation,
      avgOvulationToPreLayShed: analytics.avgOvulationToPreLayShed,
      avgPreLayShedToEggLaying: analytics.avgPreLayShedToEggLaying,
      avgOvulationToEggLaying:  analytics.avgOvulationToEggLaying,
      avgFertilityRate:         analytics.avgFertilityRate,
      confidenceLevel:          analytics.confidence,
      patternTagsJson:          analytics.patternTags,
      lastCalculatedAt:         new Date(),
    },
    update: {
      totalCycles:              analytics.totalCycles,
      avgLocksPerCycle:         analytics.avgLocksPerCycle,
      avgDaysBetweenLocks:      analytics.avgDaysBetweenLocks,
      avgFirstLockToOvulation:  analytics.avgFirstLockToOvulation,
      avgLastLockToOvulation:   analytics.avgLastLockToOvulation,
      avgOvulationToPreLayShed: analytics.avgOvulationToPreLayShed,
      avgPreLayShedToEggLaying: analytics.avgPreLayShedToEggLaying,
      avgOvulationToEggLaying:  analytics.avgOvulationToEggLaying,
      avgFertilityRate:         analytics.avgFertilityRate,
      confidenceLevel:          analytics.confidence,
      patternTagsJson:          analytics.patternTags,
      lastCalculatedAt:         new Date(),
    },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the full reproductive profile for a female, identified by her
 * frontend appAnimalId and the requesting user's ID.
 */
export async function getFemaleReproductiveProfile(
  femaleAppId: string,
  ownerId: string
): Promise<FemaleReproductiveProfile> {
  const db = prisma as any;

  const femaleAnimal = await db.animal.findFirst({
    where: { ownerId, appAnimalId: femaleAppId },
    select: { id: true },
  });
  if (!femaleAnimal) {
    return {
      femaleAppId,
      cycles: [],
      analytics: {
        totalCycles: 0, totalLifetimeLocks: 0,
        avgLocksPerCycle: null, avgDaysBetweenLocks: null,
        avgFirstLockToOvulation: null, avgLastLockToOvulation: null,
        avgOvulationToPreLayShed: null, avgPreLayShedToEggLaying: null,
        avgOvulationToEggLaying: null, avgFertilityRate: null,
        confidence: "none", patternTags: [],
      },
      predictions: {
        source: "species_default", confidence: "none", basedOnCycles: 0,
        fromOvulation: null, fromPreLayShed: null, nextLockEstimate: null,
      },
    };
  }

  const cycles  = await db.reproductiveCycle.findMany({
    where:   { femaleAnimalId: femaleAnimal.id },
    include: { locks: true },
    orderBy: [{ season: "desc" }, { cycleIndex: "asc" }],
  });
  const allLocks = cycles.flatMap((c: any) => c.locks as any[]);

  const analytics   = await buildLifetimeAnalytics(femaleAnimal.id, ownerId, cycles, allLocks);
  const predictions = await buildPredictions(femaleAnimal.id, ownerId, analytics, cycles, allLocks);

  const locksByCycle = new Map<string, any[]>();
  for (const lock of allLocks) {
    const arr = locksByCycle.get(lock.cycleId ?? "__none") ?? [];
    arr.push(lock);
    locksByCycle.set(lock.cycleId ?? "__none", arr);
  }

  const cyclesOut: ReproductiveCycleOut[] = cycles.map((c: any) => {
    const locks = locksByCycle.get(c.id) ?? [];
    return {
      id:              c.id,
      season:          c.season,
      cycleIndex:      c.cycleIndex,
      maleAppId:       c.maleAppId,
      pairingAppId:    c.pairingAppId,
      pairingStartDate: c.pairingStartDate,
      pairingEndDate:   c.pairingEndDate,
      ovulationDate:    c.ovulationDate,
      preLayShedDate:   c.preLayShedDate,
      eggLayingDate:    c.eggLayingDate,
      eggCount:         c.eggCount,
      fertileCount:     c.fertileCount,
      slugCount:        c.slugCount,
      notes:            c.notes,
      locks: locks
        .sort((a: any, b: any) => (a.lockDate as string).localeCompare(b.lockDate))
        .map((l: any) => ({
          id:         l.id,
          lockDate:   l.lockDate,
          cycleId:    l.cycleId,
          sourceType: l.sourceType,
          notes:      l.notes,
        })),
      intervals: calcIntervals(c, locks),
    };
  });

  return { femaleAppId, cycles: cyclesOut, analytics, predictions };
}

/**
 * Manually add or update a lock event for a female.
 * Called from the snake card lock entry UI.
 */
export async function addManualLock(
  femaleAppId: string,
  ownerId: string,
  lockDate: string,
  cycleId?: string,
  notes?: string
): Promise<LockEventOut> {
  const db = prisma as any;

  const femaleAnimal = await db.animal.findFirst({
    where: { ownerId, appAnimalId: femaleAppId },
    select: { id: true },
  });
  if (!femaleAnimal) throw new Error("Female animal not found");

  const result = await db.lockEvent.upsert({
    where: { femaleAnimalId_lockDate: { femaleAnimalId: femaleAnimal.id, lockDate } },
    create: {
      ownerId,
      femaleAnimalId: femaleAnimal.id,
      femaleAppId,
      cycleId: cycleId ?? null,
      lockDate,
      sourceType: "manual",
      notes: notes ?? null,
    },
    update: {
      cycleId: cycleId ?? undefined,
      notes:   notes ?? undefined,
    },
  });

  await rebuildAnalyticsCache(femaleAnimal.id, femaleAppId, ownerId);
  return { id: result.id, lockDate: result.lockDate, cycleId: result.cycleId, sourceType: result.sourceType, notes: result.notes };
}

/**
 * Manually create or update a reproductive cycle for a female.
 */
export async function upsertCycleManual(
  femaleAppId: string,
  ownerId: string,
  cycleData: {
    season: number;
    cycleIndex?: number;
    maleAppId?: string;
    pairingStartDate?: string;
    ovulationDate?: string;
    preLayShedDate?: string;
    eggLayingDate?: string;
    eggCount?: number;
    fertileCount?: number;
    slugCount?: number;
    notes?: string;
  }
): Promise<ReproductiveCycleOut> {
  const db = prisma as any;

  const femaleAnimal = await db.animal.findFirst({
    where: { ownerId, appAnimalId: femaleAppId },
    select: { id: true },
  });
  if (!femaleAnimal) throw new Error("Female animal not found");

  const maleAnimal = cycleData.maleAppId
    ? await db.animal.findFirst({ where: { ownerId, appAnimalId: cycleData.maleAppId }, select: { id: true } })
    : null;

  const existingCount = await db.reproductiveCycle.count({
    where: { femaleAnimalId: femaleAnimal.id, season: cycleData.season },
  });
  const cycleIndex = cycleData.cycleIndex ?? existingCount + 1;

  const cycle = await db.reproductiveCycle.upsert({
    where: { femaleAnimalId_season_cycleIndex: { femaleAnimalId: femaleAnimal.id, season: cycleData.season, cycleIndex } },
    create: {
      ownerId,
      femaleAnimalId:   femaleAnimal.id,
      femaleAppId,
      maleAnimalId:     maleAnimal?.id ?? null,
      maleAppId:        cycleData.maleAppId ?? null,
      season:           cycleData.season,
      cycleIndex,
      pairingStartDate: cycleData.pairingStartDate ?? null,
      ovulationDate:    cycleData.ovulationDate ?? null,
      preLayShedDate:   cycleData.preLayShedDate ?? null,
      eggLayingDate:    cycleData.eggLayingDate ?? null,
      eggCount:         cycleData.eggCount ?? null,
      fertileCount:     cycleData.fertileCount ?? null,
      slugCount:        cycleData.slugCount ?? null,
      notes:            cycleData.notes ?? null,
    },
    update: {
      maleAnimalId:     maleAnimal?.id ?? undefined,
      maleAppId:        cycleData.maleAppId ?? undefined,
      pairingStartDate: cycleData.pairingStartDate ?? undefined,
      ovulationDate:    cycleData.ovulationDate ?? undefined,
      preLayShedDate:   cycleData.preLayShedDate ?? undefined,
      eggLayingDate:    cycleData.eggLayingDate ?? undefined,
      eggCount:         cycleData.eggCount ?? undefined,
      fertileCount:     cycleData.fertileCount ?? undefined,
      slugCount:        cycleData.slugCount ?? undefined,
      notes:            cycleData.notes ?? undefined,
    },
    include: { locks: true },
  });

  await rebuildAnalyticsCache(femaleAnimal.id, femaleAppId, ownerId);

  return {
    id:              cycle.id,
    season:          cycle.season,
    cycleIndex:      cycle.cycleIndex,
    maleAppId:       cycle.maleAppId,
    pairingAppId:    cycle.pairingAppId,
    pairingStartDate: cycle.pairingStartDate,
    pairingEndDate:   cycle.pairingEndDate,
    ovulationDate:    cycle.ovulationDate,
    preLayShedDate:   cycle.preLayShedDate,
    eggLayingDate:    cycle.eggLayingDate,
    eggCount:         cycle.eggCount,
    fertileCount:     cycle.fertileCount,
    slugCount:        cycle.slugCount,
    notes:            cycle.notes,
    locks:            cycle.locks.map((l: any) => ({ id: l.id, lockDate: l.lockDate, cycleId: l.cycleId, sourceType: l.sourceType, notes: l.notes })),
    intervals:        calcIntervals(cycle, cycle.locks),
  };
}
