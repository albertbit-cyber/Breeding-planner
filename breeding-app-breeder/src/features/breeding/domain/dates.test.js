import { describe, it, expect } from 'vitest';
import { addCalendarMonths, addDays, diffDays, isValidYmd, toYmd, daysInMonth } from './dates';
import { defaultSeasonLabel, seasonStartYear } from './season';

describe('date-only arithmetic', () => {
  it('validates calendar days strictly', () => {
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(toYmd('2026-03-01T23:30:00.000Z')).toBe('2026-03-01');
    expect(toYmd('')).toBeNull();
  });

  it('counts whole days without a time component', () => {
    expect(diffDays('2026-03-01', '2026-03-03')).toBe(2);
    expect(diffDays('2026-03-03', '2026-03-01')).toBe(-2);
    // Across the European DST change (2026-03-29): still exactly 7 days.
    expect(diffDays('2026-03-25', '2026-04-01')).toBe(7);
    expect(diffDays(null, '2026-04-01')).toBeNull();
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds true calendar months with end-of-month clamping (acceptance F)', () => {
    expect(addCalendarMonths('2026-03-01', 1)).toBe('2026-04-01');
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addCalendarMonths('2026-08-31', 1)).toBe('2026-09-30');
    expect(addCalendarMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addCalendarMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe('season labels', () => {
  it('defaults from the start year only', () => {
    expect(defaultSeasonLabel('2026-02-10')).toBe('2026–27');
    expect(defaultSeasonLabel('2026-11-10')).toBe('2026–27');
    expect(defaultSeasonLabel(null)).toBe('');
    expect(seasonStartYear('2026–27')).toBe(2026);
  });
});
