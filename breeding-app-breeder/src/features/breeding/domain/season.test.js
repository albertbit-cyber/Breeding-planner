import { describe, it, expect } from 'vitest';
import {
  resolveSeasonLabel,
  seasonStartDate,
  startNewSeason,
  initializeSeasonSettings,
  cyclesNeedingSeasonLabel,
  summarizeSeasons,
  normalizeSeasonSettings,
  currentSeasonLabel,
} from './season';

describe('season boundaries', () => {
  it('uses 1 September by default', () => {
    expect(resolveSeasonLabel('2025-11-03', null)).toBe('2025–26');
    expect(resolveSeasonLabel('2026-03-20', null)).toBe('2025–26');
    expect(resolveSeasonLabel('2026-09-01', null)).toBe('2026–27');
    expect(seasonStartDate('2026–27', null)).toBe('2026-09-01');
  });

  it('honours a configured start day', () => {
    const settings = { startMonth: 10, startDay: 15 };
    expect(resolveSeasonLabel('2026-10-14', settings)).toBe('2025–26');
    expect(resolveSeasonLabel('2026-10-15', settings)).toBe('2026–27');
  });

  it('a manual start replaces the calendar boundary for that season only', () => {
    const settings = { manualStarts: [{ label: '2026–27', startDate: '2026-10-14' }] };
    expect(resolveSeasonLabel('2026-09-20', settings)).toBe('2025–26');
    expect(resolveSeasonLabel('2026-10-14', settings)).toBe('2026–27');
    expect(resolveSeasonLabel('2027-09-02', settings)).toBe('2027–28');
  });

  it('a manual start earlier than the calendar boundary (breeder starts in July) works too', () => {
    const settings = { manualStarts: [{ label: '2027–28', startDate: '2027-07-01' }] };
    expect(resolveSeasonLabel('2027-06-30', settings)).toBe('2026–27');
    expect(resolveSeasonLabel('2027-07-15', settings)).toBe('2027–28');
  });
});

describe('Start new season', () => {
  it('starts the season after the current one today, once', () => {
    const first = startNewSeason(null, { today: '2027-07-01', now: 'T' });
    expect(first.changed).toBe(true);
    expect(first.label).toBe('2027–28');
    expect(currentSeasonLabel(first.settings, '2027-07-01')).toBe('2027–28');
    const second = startNewSeason(first.settings, { today: '2027-07-01', now: 'T' });
    expect(second.changed).toBe(false);
    expect(second.settings.manualStarts).toHaveLength(1);
  });
});

describe('switching seasons on keeps running cycles in their season', () => {
  const running = { id: 'c1', status: 'active', startDate: '2026-09-20' };
  it('records the current season as starting today when a running cycle started after the boundary', () => {
    const { settings } = initializeSeasonSettings(null, [running], { today: '2026-10-14', now: 'T' });
    expect(settings.initializedAt).toBe('T');
    expect(resolveSeasonLabel('2026-09-20', settings)).toBe('2025–26');
    expect(resolveSeasonLabel('2026-10-14', settings)).toBe('2026–27');
  });
  it('keeps the plain 1 September rule when nothing is running across the boundary', () => {
    const { settings } = initializeSeasonSettings(null, [{ ...running, startDate: '2026-02-01' }, { id: 'c2', status: 'closed', startDate: '2026-09-10' }], { today: '2026-10-14', now: 'T' });
    expect(settings.manualStarts).toEqual([]);
  });
  it('runs once', () => {
    const once = initializeSeasonSettings(null, [], { today: '2026-10-14', now: 'T' });
    expect(initializeSeasonSettings(once.settings, [running], { today: '2026-10-14' }).changed).toBe(false);
  });
});

describe('labels and summaries', () => {
  it('relabels automatic labels only', () => {
    const cycles = [
      { id: 'a', startDate: '2026-01-10', seasonLabel: '2026–27', seasonLabelSource: 'auto' },
      { id: 'b', startDate: '2026-01-10', seasonLabel: 'My label', seasonLabelSource: 'manual' },
      { id: 'c', startDate: '2026-10-01', seasonLabel: '2026–27', seasonLabelSource: 'auto' },
    ];
    expect(cyclesNeedingSeasonLabel(cycles, null)).toEqual([{ id: 'a', label: '2025–26' }]);
  });

  it('a season ends when its last cycle closes; the current season never shows as ended', () => {
    const cycles = [
      { id: 'a', seasonLabel: '2025–26', startDate: '2025-11-01', status: 'closed', closure: { biologicalCompletionDate: '2026-07-10' } },
      { id: 'b', seasonLabel: '2025–26', startDate: '2025-12-01', status: 'closed', closure: { biologicalCompletionDate: '2026-08-02' } },
      { id: 'c', seasonLabel: '2024–25', startDate: '2024-11-01', status: 'active' },
    ];
    const rows = summarizeSeasons(cycles, null, { today: '2026-10-14' });
    expect(rows.map((r) => r.label)).toEqual(['2026–27', '2025–26', '2024–25']);
    expect(rows[0]).toMatchObject({ isCurrent: true, ended: false });
    expect(rows[1]).toMatchObject({ ended: true, endedOn: '2026-08-02' });
    expect(rows[2]).toMatchObject({ ended: false, open: 1 });
  });

  it('normalises settings defensively', () => {
    expect(normalizeSeasonSettings({ startMonth: 2, startDay: 31 })).toMatchObject({ startMonth: 2, startDay: 1 });
  });
});
