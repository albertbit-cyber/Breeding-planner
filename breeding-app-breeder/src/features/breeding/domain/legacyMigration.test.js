import { describe, it, expect } from 'vitest';
import { planLegacyMigration, legacyCounts, cycleCounts, explicitSeasonToken } from './legacyMigration';
import { countObservedLocks, countSessions } from './cycleModel';

const NOW = '2026-03-01T10:00:00.000Z';

const singleMale = {
  id: '2025 Zeus X Athena',
  femaleId: 'F-athena',
  maleId: 'M-zeus',
  label: 'Athena × Zeus',
  startDate: '2025-11-01',
  appointments: [
    { id: 'a1', date: '2025-11-01', appointmentDone: true, pairingDate: '2025-11-01', lockObserved: true, lockDate: '2025-11-02', notes: 'good lock' },
    { id: 'a2', date: '2025-12-01', appointmentDone: true, pairingDate: '2025-12-01', lockObserved: false },
    { id: 'a3', date: '2026-01-01', appointmentDone: false, lockObserved: false },
  ],
  ovulation: { observed: true, date: '2026-01-15' },
  preLayShed: { observed: true, date: '2026-02-02' },
  clutch: { recorded: true, date: '2026-03-01', eggsTotal: 6, fertileEggs: 5, slugs: 1 },
  hatch: { recorded: false },
  workflowStatus: 'active',
};

const multiSeason = [
  { id: 'p-2024', femaleId: 'F-hera', maleId: 'M-a', cycleYear: 2024, startDate: '2024-11-01', appointments: [{ id: 'x1', date: '2024-11-01', appointmentDone: true, pairingDate: '2024-11-01', lockObserved: true, lockDate: '2024-11-01' }], workflowStatus: 'completed', completionReason: 'eggs_laid', completedAt: '2025-05-01T00:00:00.000Z', clutch: { recorded: true, date: '2025-02-01', eggsTotal: 4 } },
  { id: 'p-2025-a', femaleId: 'F-hera', maleId: 'M-a', cycleYear: 2025, startDate: '2025-11-01', appointments: [{ id: 'y1', date: '2025-11-01', appointmentDone: true, pairingDate: '2025-11-01', lockObserved: true, lockDate: '2025-11-03' }] },
  { id: 'p-2025-b', femaleId: 'F-hera', maleId: 'M-b', cycleYear: 2025, startDate: '2025-11-15', appointments: [{ id: 'z1', date: '2025-11-15', appointmentDone: true, pairingDate: '2025-11-15', lockObserved: true, lockDate: '2025-11-15' }] },
];

describe('P. legacy migration', () => {
  it('maps a single-male pairing to one cycle preserving dates, locks, planned entries, milestones and clutch', () => {
    const { cycles, report } = planLegacyMigration([singleMale], [], { now: NOW });
    expect(cycles).toHaveLength(1);
    const cycle = cycles[0];
    expect(cycle.id).toBe('bc-legacy-2025 Zeus X Athena');
    expect(cycle.femaleId).toBe('F-athena');
    expect(cycle.startDate).toBe('2025-11-01');
    expect(countSessions(cycle)).toBe(2);
    expect(countObservedLocks(cycle)).toBe(1); // the done-but-unlocked appointment never becomes observed
    expect(cycle.sessions[0].locks[0].observationDate).toBe('2025-11-02');
    expect(cycle.plannedPairings).toHaveLength(1);
    expect(cycle.plannedPairings[0].date).toBe('2026-01-01');
    expect(cycle.events.map((e) => e.type).sort()).toEqual(['egg_laying', 'ovulation', 'pre_lay_shed']);
    expect(cycle.clutch).toMatchObject({ eggsTotal: 6, fertileEggs: 5, slugs: 1, outcomeComplete: false });
    expect(cycle.legacy.pairingIds).toEqual(['2025 Zeus X Athena']);
    expect(cycle.legacy.reviewNeeded).toBe(false);
    expect(report.mappings).toEqual([{ pairingId: '2025 Zeus X Athena', cycleId: cycle.id, merged: false }]);
  });

  it('is rerun-safe: a second run skips existing cycles and preserves counts', () => {
    const first = planLegacyMigration([singleMale], [], { now: NOW });
    const second = planLegacyMigration([singleMale], first.cycles, { now: NOW });
    expect(second.cycles).toHaveLength(0);
    expect(second.report.skippedExisting).toBe(1);
    const before = legacyCounts([singleMale]);
    const after = cycleCounts(first.cycles);
    expect(after.locks).toBe(before.datedLocks);
    expect(after.sessions).toBe(before.introductions);
    expect(after.planned).toBe(before.plannedOnly);
  });

  it('merges only with explicit season evidence and keeps years apart', () => {
    const { cycles, report } = planLegacyMigration(multiSeason, [], { now: NOW });
    expect(cycles).toHaveLength(2);
    const season2025 = cycles.find((c) => c.legacy.pairingIds.includes('p-2025-a'));
    expect(season2025.legacy.pairingIds.sort()).toEqual(['p-2025-a', 'p-2025-b']);
    expect(season2025.multipleSires).toBe(true);
    expect(season2025.males.map((m) => m.maleId).sort()).toEqual(['M-a', 'M-b']);
    expect(countObservedLocks(season2025)).toBe(2);
    expect(season2025.legacy.reviewReasons).toContain('merged_by_explicit_season');
    const season2024 = cycles.find((c) => c.legacy.pairingIds.includes('p-2024'));
    expect(season2024.status).toBe('closed');
    expect(season2024.closure.outcome).toBe('other');
    expect(season2024.seasonLabel).toBe('2024–25');
    expect(report.merged).toBe(1);
  });

  it('does not merge same-year pairings without explicit season evidence; it flags them', () => {
    const noTokens = multiSeason.slice(1).map(({ cycleYear, ...p }) => p);
    expect(explicitSeasonToken(noTokens[0])).toBeNull();
    const { cycles, report } = planLegacyMigration(noTokens, [], { now: NOW });
    expect(cycles).toHaveLength(2);
    expect(report.reviewNeeded.length).toBe(2);
    cycles.forEach((c) => expect(c.legacy.reviewReasons).toContain('multiple_active_legacy_pairings'));
  });

  it('keeps aggregate lock counts as an aggregate, never as dated locks, and does not convert unknown to observed', () => {
    const aggregate = { id: 'p-agg', femaleId: 'F-x', maleId: 'M-x', startDate: '2025-10-01', lockCount: 4, appointments: [{ id: 'q1', date: '2025-10-01', appointmentDone: true, pairingDate: '2025-10-01', lockObserved: false }] };
    const { cycles, report } = planLegacyMigration([aggregate], [], { now: NOW });
    expect(countObservedLocks(cycles[0])).toBe(0);
    expect(cycles[0].legacy.aggregateLocks).toMatchObject({ count: 4, source: 'legacy_aggregate' });
    expect(report.aggregateLocks).toEqual([{ cycleId: cycles[0].id, count: 4 }]);
    expect(cycles[0].legacy.reviewReasons).toContain('aggregate_locks_without_dates');
  });

  it('handles missing dates and partial cycles without inventing anything', () => {
    const partial = { id: 'p-partial', femaleId: 'F-y', maleId: 'M-y', appointments: [{ id: 'r1', date: '2025-12-01', lockObserved: true }] };
    const { cycles } = planLegacyMigration([partial], [], { now: NOW });
    expect(cycles[0].startDate).toBe('2025-12-01');
    expect(countObservedLocks(cycles[0])).toBe(1);
    expect(cycles[0].sessions[0].source.introductionInferredFromLock).toBe(true);
    expect(cycles[0].legacy.reviewReasons).toContain('introduction_inferred_from_lock');
    const noDates = { id: 'p-nodates', femaleId: 'F-z', maleId: 'M-z', appointments: [] };
    const result = planLegacyMigration([noDates], [], { now: NOW });
    expect(result.cycles[0].startDate).toBeNull();
    expect(result.cycles[0].legacy.reviewReasons).toContain('no_actual_pairing_date');
    const demo = planLegacyMigration([{ ...noDates, isDemo: true }], [], { now: NOW });
    expect(demo.cycles).toHaveLength(0);
  });
});
