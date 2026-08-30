import { describe, expect, it } from 'vitest';
import {
  QUARANTINE_STATUS,
  QUARANTINE_TAG,
  addDaysToYmd,
  addQuarantineCheck,
  addQuarantineTest,
  addQuarantineTreatment,
  applyQuarantineStatus,
  countQuarantined,
  daysBetweenYmd,
  deriveQuarantineEvents,
  extendQuarantine,
  getClearanceChecklist,
  getDefaultDaysForSource,
  getNextQuarantineAction,
  getOpenQuarantineFlags,
  getPlannedDays,
  getQuarantineChecks,
  getQuarantineDays,
  getQuarantineHistory,
  getQuarantineProgress,
  getQuarantineStatus,
  getQuarantineTests,
  getWeightChangeSinceIntake,
  isQuarantineTag,
  normalizeQuarantine,
  reconcileQuarantineWithStatus,
  removeQuarantineCheck,
  restartQuarantineClock,
  selectQuarantineAnimals,
  setQuarantineTestResult,
  summarizeQuarantine,
  updateQuarantineDetails,
} from './quarantine';

const TODAY = '2026-08-20';

describe('quarantine status derivation', () => {
  it('treats the status tag as the source of truth for membership', () => {
    expect(getQuarantineStatus({ status: 'Quarantine' })).toBe(QUARANTINE_STATUS.IN);
    expect(getQuarantineStatus({ status: 'Active' })).toBe(QUARANTINE_STATUS.NONE);
  });

  it('matches the tag regardless of casing or padding', () => {
    expect(isQuarantineTag('  quarantine ')).toBe(true);
    expect(isQuarantineTag('QUARANTINE')).toBe(true);
    expect(isQuarantineTag('Quarantined')).toBe(false);
    expect(isQuarantineTag('')).toBe(false);
  });

  // Breeders were tagging animals "Quarantine" long before this feature existed. Those animals
  // have no record at all, and they must still show up in the section.
  it('reports a pre-existing tagged animal as in quarantine with no record', () => {
    const snake = { status: 'Quarantine' };
    expect(getQuarantineStatus(snake)).toBe(QUARANTINE_STATUS.IN);
    expect(getQuarantineDays(snake, TODAY)).toBeNull();
  });

  it('reports an untagged animal carrying a finished record as cleared', () => {
    const snake = { status: 'Active', quarantine: { startedAt: '2026-08-01', clearedAt: '2026-08-10' } };
    expect(getQuarantineStatus(snake)).toBe(QUARANTINE_STATUS.CLEARED);
  });

  it('never lets the tag and the record disagree: the tag wins', () => {
    const snake = { status: 'Quarantine', quarantine: { startedAt: '2026-08-01', clearedAt: '2026-08-10' } };
    expect(getQuarantineStatus(snake)).toBe(QUARANTINE_STATUS.IN);
  });
});

describe('normalizeQuarantine', () => {
  it('returns null for an animal that never touched quarantine', () => {
    expect(normalizeQuarantine(null)).toBeNull();
    expect(normalizeQuarantine({})).toBeNull();
    expect(normalizeQuarantine({ startedAt: '', notes: '   ' })).toBeNull();
  });

  it('keeps dates as plain YYYY-MM-DD and drops unparseable ones', () => {
    const record = normalizeQuarantine({ startedAt: '2026-08-01T12:00:00.000Z', clearedAt: 'not a date' });
    expect(record.startedAt).toBe('2026-08-01');
    expect(record.clearedAt).toBeNull();
  });

  it('deduplicates history entries by their content-derived id', () => {
    const entry = { from: 'none', to: 'in', date: '2026-08-01', note: '' };
    const record = normalizeQuarantine({ history: [entry, { ...entry }] });
    expect(record.history).toHaveLength(1);
  });

  // A random id here would mint a fresh "distinct" copy on every sync -- the bug that turned 116
  // weight readings into 222,517 rows.
  it('derives stable ids so re-normalizing never invents new entries', () => {
    const first = normalizeQuarantine({ history: [{ from: 'none', to: 'in', date: '2026-08-01' }] });
    const second = normalizeQuarantine(first);
    expect(second.history[0].id).toBe(first.history[0].id);
  });
});

describe('applyQuarantineStatus', () => {
  it('sets the tag and start date when an animal enters quarantine', () => {
    const next = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: TODAY });
    expect(next.status).toBe(QUARANTINE_TAG);
    expect(next.quarantine.startedAt).toBe(TODAY);
    expect(next.quarantine.clearedAt).toBeNull();
  });

  it('does not mutate the animal it was given', () => {
    const snake = { status: 'Active' };
    applyQuarantineStatus(snake, QUARANTINE_STATUS.IN, { today: TODAY });
    expect(snake.status).toBe('Active');
    expect(snake.quarantine).toBeUndefined();
  });

  // status holds one tag, not a list, so entering quarantine necessarily overwrites whatever was
  // there. Losing it silently would quietly rewrite the breeder's own records.
  it('parks the previous tag and hands it back on clear', () => {
    const entered = applyQuarantineStatus({ status: 'Grow-out' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });
    expect(entered.quarantine.previousStatus).toBe('Grow-out');

    const cleared = applyQuarantineStatus(entered, QUARANTINE_STATUS.CLEARED, { today: TODAY });
    expect(cleared.status).toBe('Grow-out');
    expect(cleared.quarantine.clearedAt).toBe(TODAY);
  });

  it('falls back to Active when there is no previous tag to restore', () => {
    const entered = applyQuarantineStatus({ status: '' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });
    const cleared = applyQuarantineStatus(entered, QUARANTINE_STATUS.CLEARED, { today: TODAY });
    expect(cleared.status).toBe('Active');
  });

  it('never parks "Quarantine" as the tag to restore', () => {
    const entered = applyQuarantineStatus({ status: 'Quarantine' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });
    expect(entered.quarantine.previousStatus).toBe('');
    const cleared = applyQuarantineStatus(entered, QUARANTINE_STATUS.CLEARED, { today: TODAY });
    expect(cleared.status).toBe('Active');
  });

  it('is idempotent: re-entering quarantine keeps the original start date and adds no history', () => {
    const first = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });
    const second = applyQuarantineStatus(first, QUARANTINE_STATUS.IN, { today: TODAY });
    expect(second.quarantine.startedAt).toBe('2026-08-01');
    expect(second.quarantine.history).toHaveLength(1);
  });

  it('records each real transition in history', () => {
    const entered = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01', note: 'Bought at expo' });
    const cleared = applyQuarantineStatus(entered, QUARANTINE_STATUS.CLEARED, { today: TODAY, note: 'Vet checked' });
    const history = getQuarantineHistory(cleared);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ from: 'none', to: 'in', date: '2026-08-01', note: 'Bought at expo' });
    expect(history[1]).toMatchObject({ from: 'in', to: 'cleared', date: TODAY, note: 'Vet checked' });
  });

  it('reopens quarantine for an animal that was previously cleared', () => {
    const entered = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-07-01' });
    const cleared = applyQuarantineStatus(entered, QUARANTINE_STATUS.CLEARED, { today: '2026-07-20' });
    const reentered = applyQuarantineStatus(cleared, QUARANTINE_STATUS.IN, { today: TODAY });
    expect(reentered.status).toBe(QUARANTINE_TAG);
    expect(reentered.quarantine.startedAt).toBe(TODAY);
    expect(reentered.quarantine.clearedAt).toBeNull();
    expect(reentered.quarantine.history).toHaveLength(3);
  });

  // A mistaken tag must be fully undoable, or it leaves a permanent scar on the animal.
  it('wipes the record entirely when set back to No Quarantine', () => {
    const entered = applyQuarantineStatus({ status: 'Breeder' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });
    const none = applyQuarantineStatus(entered, QUARANTINE_STATUS.NONE, { today: TODAY });
    expect(none.quarantine).toBeNull();
    expect(none.status).toBe('Breeder');
    expect(getQuarantineStatus(none)).toBe(QUARANTINE_STATUS.NONE);
  });

  it('honours a backdated start date', () => {
    const next = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { date: '2026-08-05', today: TODAY });
    expect(next.quarantine.startedAt).toBe('2026-08-05');
  });
});

describe('getQuarantineDays', () => {
  it('counts the start day as day 1', () => {
    const snake = { status: 'Quarantine', quarantine: { startedAt: TODAY } };
    expect(getQuarantineDays(snake, TODAY)).toBe(1);
  });

  it('counts calendar days elapsed for an open quarantine', () => {
    const snake = { status: 'Quarantine', quarantine: { startedAt: '2026-08-01' } };
    expect(getQuarantineDays(snake, TODAY)).toBe(20);
  });

  it('freezes the count at the cleared date once quarantine ends', () => {
    const snake = { status: 'Active', quarantine: { startedAt: '2026-08-01', clearedAt: '2026-08-10' } };
    expect(getQuarantineDays(snake, TODAY)).toBe(10);
  });

  it('returns null when no start date was ever recorded', () => {
    expect(getQuarantineDays({ status: 'Quarantine' }, TODAY)).toBeNull();
  });

  it('spans month and year boundaries', () => {
    expect(daysBetweenYmd('2025-12-28', '2026-01-04')).toBe(7);
  });
});

describe('updateQuarantineDetails', () => {
  it('edits dates and notes on an existing record', () => {
    const snake = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: TODAY });
    const edited = updateQuarantineDetails(snake, { startedAt: '2026-08-02', notes: 'Mites treated' });
    expect(edited.quarantine.startedAt).toBe('2026-08-02');
    expect(edited.quarantine.notes).toBe('Mites treated');
  });

  it('leaves an animal with no quarantine untouched', () => {
    const snake = { status: 'Active' };
    expect(updateQuarantineDetails(snake, { notes: 'nope' })).toBe(snake);
  });
});

describe('reconcileQuarantineWithStatus', () => {
  it('opens a record when the tag was set from the status dropdown', () => {
    const next = reconcileQuarantineWithStatus({ status: 'Quarantine' }, { today: TODAY });
    expect(next.quarantine.startedAt).toBe(TODAY);
    expect(next.quarantine.history).toHaveLength(1);
  });

  it('closes an open record when the tag was removed by hand', () => {
    const snake = { status: 'Active', quarantine: { startedAt: '2026-08-01' } };
    const next = reconcileQuarantineWithStatus(snake, { today: TODAY });
    expect(next.quarantine.clearedAt).toBe(TODAY);
    expect(getQuarantineStatus(next)).toBe(QUARANTINE_STATUS.CLEARED);
  });

  it('is a no-op when tag and record already agree', () => {
    const snake = { status: 'Quarantine', quarantine: { startedAt: '2026-08-01', clearedAt: null, notes: '', previousStatus: '', history: [] } };
    expect(reconcileQuarantineWithStatus(snake, { today: TODAY })).toBe(snake);
  });

  it('leaves an animal that never touched quarantine alone', () => {
    const snake = { status: 'Active' };
    expect(reconcileQuarantineWithStatus(snake, { today: TODAY })).toBe(snake);
  });

  it('does not resurrect a cleared record when the animal is untagged', () => {
    const snake = { status: 'Active', quarantine: { startedAt: '2026-08-01', clearedAt: '2026-08-10' } };
    expect(reconcileQuarantineWithStatus(snake, { today: TODAY })).toBe(snake);
  });
});

describe('selection and counting', () => {
  const animals = [
    { id: 'a', name: 'Runa', status: 'Quarantine', quarantine: { startedAt: '2026-08-10' } },
    { id: 'b', name: 'Kaa', status: 'Quarantine', quarantine: { startedAt: '2026-08-01' } },
    { id: 'c', name: 'Nyx', status: 'Active', quarantine: { startedAt: '2026-07-01', clearedAt: '2026-07-20' } },
    { id: 'd', name: 'Zed', status: 'Active' },
    { id: 'e', name: 'Ash', status: 'Quarantine' },
  ];

  it('counts only animals currently in quarantine', () => {
    expect(countQuarantined(animals)).toBe(3);
  });

  it('sorts the in-quarantine list longest-running first', () => {
    expect(selectQuarantineAnimals(animals, QUARANTINE_STATUS.IN).map(s => s.id)).toEqual(['b', 'a', 'e']);
  });

  it('selects cleared animals', () => {
    expect(selectQuarantineAnimals(animals, QUARANTINE_STATUS.CLEARED).map(s => s.id)).toEqual(['c']);
  });

  it('excludes animals that never touched quarantine from the all filter', () => {
    expect(selectQuarantineAnimals(animals, 'all').map(s => s.id)).not.toContain('d');
  });

  it('tolerates a missing list', () => {
    expect(countQuarantined(undefined)).toBe(0);
    expect(selectQuarantineAnimals(undefined)).toEqual([]);
  });
});

describe('deriveQuarantineEvents', () => {
  it('emits a start and a cleared event per record, in date order', () => {
    const events = deriveQuarantineEvents([
      { id: 'a', name: 'Runa', status: 'Active', quarantine: { startedAt: '2026-08-01', clearedAt: '2026-08-15' } },
      { id: 'b', name: 'Kaa', status: 'Quarantine', quarantine: { startedAt: '2026-08-05' } },
    ]);
    expect(events.map(e => [e.date, e.kind])).toEqual([
      ['2026-08-01', 'start'],
      ['2026-08-05', 'start'],
      ['2026-08-15', 'cleared'],
    ]);
  });

  it('emits nothing for animals without a record', () => {
    expect(deriveQuarantineEvents([{ id: 'a', status: 'Quarantine' }])).toEqual([]);
  });
});

describe('source-driven duration', () => {
  it('scales the suggested clock with how risky the source is', () => {
    expect(getDefaultDaysForSource('own-collection')).toBe(0);
    expect(getDefaultDaysForSource('known-breeder')).toBe(90);
    expect(getDefaultDaysForSource('expo')).toBe(120);
    expect(getDefaultDaysForSource('wild-caught')).toBe(180);
  });

  it('applies the source default when an animal enters quarantine', () => {
    const snake = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: TODAY, source: 'expo' });
    expect(snake.quarantine.source).toBe('expo');
    expect(getPlannedDays(snake)).toBe(120);
  });

  it('re-suggests the duration when the source is corrected', () => {
    const snake = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: TODAY, source: 'known-breeder' });
    const corrected = updateQuarantineDetails(snake, { source: 'import' });
    expect(getPlannedDays(corrected)).toBe(180);
  });

  // A breeder who typed 150 means 150. Correcting the source field must not quietly overwrite it.
  it('never overwrites a hand-set duration', () => {
    const snake = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: TODAY, source: 'known-breeder' });
    const custom = updateQuarantineDetails(snake, { plannedDays: 150 });
    const corrected = updateQuarantineDetails(custom, { source: 'import' });
    expect(getPlannedDays(corrected)).toBe(150);
  });

  it('ignores a source value it does not recognise', () => {
    const snake = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: TODAY, source: 'nonsense' });
    expect(snake.quarantine.source).toBe('');
  });
});

describe('progress', () => {
  const snake = { status: 'Quarantine', quarantine: { startedAt: '2026-08-01', plannedDays: 90 } };

  it('reports days served against the plan', () => {
    const progress = getQuarantineProgress(snake, TODAY);
    expect(progress.days).toBe(20);
    expect(progress.planned).toBe(90);
    expect(progress.remaining).toBe(70);
  });

  it('computes the due date inclusive of day 1', () => {
    expect(getQuarantineProgress(snake, TODAY).dueDate).toBe('2026-10-29');
    expect(addDaysToYmd('2026-08-01', 89)).toBe('2026-10-29');
  });

  it('caps the ratio at 1 once the clock is served', () => {
    const overdue = { status: 'Quarantine', quarantine: { startedAt: '2026-01-01', plannedDays: 30 } };
    expect(getQuarantineProgress(overdue, TODAY).ratio).toBe(1);
    expect(getQuarantineProgress(overdue, TODAY).remaining).toBeLessThan(0);
  });

  it('returns null when there is no plan to measure against', () => {
    expect(getQuarantineProgress({ status: 'Quarantine' }, TODAY)).toBeNull();
  });
});

describe('the check log', () => {
  const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });

  it('records a check and defaults every unspecified field to the clean answer', () => {
    const next = addQuarantineCheck(base, { date: '2026-08-10' });
    const check = getQuarantineChecks(next)[0];
    expect(check).toMatchObject({ mites: 'none', breathing: 'normal', stool: 'normal', shed: 'none' });
  });

  it('keeps checks in date order regardless of entry order', () => {
    const next = addQuarantineCheck(addQuarantineCheck(base, { date: '2026-08-15' }), { date: '2026-08-05' });
    expect(getQuarantineChecks(next).map(entry => entry.date)).toEqual(['2026-08-05', '2026-08-15']);
  });

  it('rejects a check with no usable date', () => {
    expect(getQuarantineChecks(addQuarantineCheck(base, { date: 'whenever' }))).toHaveLength(0);
  });

  it('removes a check by id', () => {
    const next = addQuarantineCheck(base, { date: '2026-08-10' });
    const id = getQuarantineChecks(next)[0].id;
    expect(getQuarantineChecks(removeQuarantineCheck(next, id))).toHaveLength(0);
  });

  it('tracks weight against the intake baseline', () => {
    const withIntake = updateQuarantineDetails(base, { intakeWeight: 1200 });
    const next = addQuarantineCheck(withIntake, { date: '2026-08-10', weightGrams: 1238 });
    expect(getWeightChangeSinceIntake(next)).toMatchObject({ from: 1200, to: 1238, delta: 38 });
  });
});

describe('open flags', () => {
  const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });

  it('raises a flag for a finding on the latest check', () => {
    const next = addQuarantineCheck(base, { date: '2026-08-12', mites: 'seen' });
    expect(getOpenQuarantineFlags(next)).toEqual([
      expect.objectContaining({ kind: 'check', field: 'mites', value: 'seen' }),
    ]);
  });

  // A flag answered by a later clean check is resolved; showing it forever would train the breeder
  // to ignore the amber chip entirely.
  it('clears a flag once a later check comes back clean', () => {
    const flagged = addQuarantineCheck(base, { date: '2026-08-12', mites: 'seen' });
    const resolved = addQuarantineCheck(flagged, { date: '2026-08-19' });
    expect(getOpenQuarantineFlags(resolved)).toHaveLength(0);
  });

  // "No stool" and "in shed" are ordinary states, not findings. Flagging them would cry wolf weekly.
  it('does not flag normal states like being in shed or having passed nothing', () => {
    const next = addQuarantineCheck(base, { date: '2026-08-12', stool: 'none', shed: 'in-shed' });
    expect(getOpenQuarantineFlags(next)).toHaveLength(0);
  });

  it('flags a positive test regardless of how old it is', () => {
    const next = addQuarantineTest(base, { date: '2026-08-03', kind: 'Faecal flotation', result: 'positive' });
    expect(getOpenQuarantineFlags(next)).toEqual([
      expect.objectContaining({ kind: 'test', value: 'positive' }),
    ]);
  });
});

describe('tests', () => {
  const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });

  it('records a submission as pending by default', () => {
    const next = addQuarantineTest(base, { date: '2026-08-14', kind: 'Faecal flotation' });
    expect(getQuarantineTests(next)[0].result).toBe('pending');
  });

  it('replaces the row rather than duplicating it when the result lands', () => {
    const next = addQuarantineTest(base, { date: '2026-08-14', kind: 'Faecal flotation' });
    const id = getQuarantineTests(next)[0].id;
    const resolved = setQuarantineTestResult(next, id, 'clear', { today: TODAY });
    expect(getQuarantineTests(resolved)).toHaveLength(1);
    expect(getQuarantineTests(resolved)[0]).toMatchObject({ result: 'clear', resultDate: TODAY });
  });

  it('refuses a test row with no kind', () => {
    expect(getQuarantineTests(addQuarantineTest(base, { date: '2026-08-14' }))).toHaveLength(0);
  });
});

describe('next action', () => {
  const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });

  it('puts an outstanding result above everything else', () => {
    const next = addQuarantineTest(base, { date: '2026-08-18', kind: 'Serpentovirus PCR' });
    expect(getNextQuarantineAction(next, TODAY).kind).toBe('awaiting-results');
  });

  it('asks for the first faecal about two weeks in', () => {
    const withCheck = addQuarantineCheck(base, { date: TODAY });
    expect(getNextQuarantineAction(withCheck, TODAY).kind).toBe('fecal-due');
  });

  it('asks for a weekly check once one is overdue', () => {
    const next = addQuarantineTest(addQuarantineCheck(base, { date: '2026-08-05' }), {
      date: '2026-08-14', kind: 'Faecal flotation', result: 'clear',
    });
    expect(getNextQuarantineAction(next, TODAY).kind).toBe('check-due');
  });

  it('says nothing for an animal that is not in quarantine', () => {
    expect(getNextQuarantineAction({ status: 'Active' }, TODAY)).toBeNull();
  });
});

describe('restart and extend', () => {
  it('restarts the clock to today while keeping the whole prior history', () => {
    const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-07-01' });
    const restarted = restartQuarantineClock(base, { today: TODAY, reason: 'Mites treated' });
    expect(restarted.quarantine.startedAt).toBe(TODAY);
    expect(getQuarantineDays(restarted, TODAY)).toBe(1);
    expect(getQuarantineHistory(restarted)).toHaveLength(2);
    expect(getQuarantineHistory(restarted)[1]).toMatchObject({ to: 'restarted', note: 'Mites treated' });
  });

  // Extending moves the finish line, not the start line -- day 47 stays day 47.
  it('extends the plan without touching the day count', () => {
    const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01', source: 'known-breeder' });
    const extended = extendQuarantine(base, 30, { today: TODAY });
    expect(getPlannedDays(extended)).toBe(120);
    expect(getQuarantineDays(extended, TODAY)).toBe(20);
  });

  it('ignores a nonsense extension', () => {
    const base = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-01' });
    expect(extendQuarantine(base, 0)).toBe(base);
    expect(extendQuarantine(base, -10)).toBe(base);
  });
});

describe('clearance checklist', () => {
  function buildReadyAnimal() {
    let snake = applyQuarantineStatus(
      { status: 'Active', logs: { feeds: [{ date: '2026-08-14', refused: false }] } },
      QUARANTINE_STATUS.IN,
      { today: '2026-05-01', source: 'known-breeder' }
    );
    snake = updateQuarantineDetails(snake, { intakeWeight: 1200 });
    snake = addQuarantineCheck(snake, { date: '2026-08-18', weightGrams: 1260 });
    snake = addQuarantineTest(snake, { date: '2026-08-14', kind: 'Faecal flotation', result: 'clear' });
    return snake;
  }

  it('passes every gate for an animal that has genuinely served its time', () => {
    const checklist = getClearanceChecklist(buildReadyAnimal(), TODAY);
    expect(checklist.metCount).toBe(checklist.total);
  });

  it('reports the shortfall rather than refusing, when the clock is not served', () => {
    const early = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-15', source: 'known-breeder' });
    const duration = getClearanceChecklist(early, TODAY).items.find(item => item.key === 'duration');
    expect(duration.met).toBe(false);
    expect(duration.detail.remaining).toBe(84);
  });

  it('fails the mite gate when mites were seen after the last treatment', () => {
    let snake = buildReadyAnimal();
    snake = addQuarantineTreatment(snake, { date: '2026-08-01', what: 'Mite spray' });
    snake = addQuarantineCheck(snake, { date: '2026-08-19', mites: 'seen' });
    const mites = getClearanceChecklist(snake, TODAY).items.find(item => item.key === 'mites');
    expect(mites.met).toBe(false);
  });

  it('passes the mite gate when the sighting predates the treatment', () => {
    let snake = buildReadyAnimal();
    snake = addQuarantineCheck(snake, { date: '2026-07-01', mites: 'seen' });
    snake = addQuarantineTreatment(snake, { date: '2026-07-05', what: 'Mite spray' });
    const mites = getClearanceChecklist(snake, TODAY).items.find(item => item.key === 'mites');
    expect(mites.met).toBe(true);
  });

  it('fails the feeding gate when nothing was accepted in the last 30 days', () => {
    const snake = buildReadyAnimal();
    const starved = { ...snake, logs: { feeds: [{ date: '2026-05-02', refused: false }] } };
    const feeding = getClearanceChecklist(starved, TODAY).items.find(item => item.key === 'feeding');
    expect(feeding.met).toBe(false);
  });

  it('fails the weight gate on an animal that has lost condition', () => {
    let snake = buildReadyAnimal();
    snake = addQuarantineCheck(snake, { date: '2026-08-19', weightGrams: 1100 });
    const weight = getClearanceChecklist(snake, TODAY).items.find(item => item.key === 'weight');
    expect(weight.met).toBe(false);
    expect(weight.detail.delta).toBe(-100);
  });

  // The checklist is advisory. Clearing with unmet items has to remain possible.
  it('never prevents clearing', () => {
    const early = applyQuarantineStatus({ status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-15' });
    const cleared = applyQuarantineStatus(early, QUARANTINE_STATUS.CLEARED, { today: TODAY, note: 'Cleared with unmet: duration' });
    expect(getQuarantineStatus(cleared)).toBe(QUARANTINE_STATUS.CLEARED);
    expect(getQuarantineHistory(cleared).at(-1).note).toContain('unmet');
  });
});

describe('summarizeQuarantine', () => {
  it('counts what the breeder has to act on', () => {
    const animals = [
      applyQuarantineStatus({ id: 'a', status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-05-01' }),
      addQuarantineTest(
        applyQuarantineStatus({ id: 'b', status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-18' }),
        { date: '2026-08-18', kind: 'Serpentovirus PCR' }
      ),
      addQuarantineCheck(
        applyQuarantineStatus({ id: 'c', status: 'Active' }, QUARANTINE_STATUS.IN, { today: '2026-08-19' }),
        { date: '2026-08-19', mites: 'seen' }
      ),
      { id: 'd', status: 'Active' },
    ];
    const summary = summarizeQuarantine(animals, TODAY);
    expect(summary.inQuarantine).toBe(3);
    expect(summary.awaitingResults).toBe(1);
    expect(summary.flagged).toBe(1);
    expect(summary.checkDue).toBeGreaterThanOrEqual(1);
  });

  it('handles an empty collection', () => {
    expect(summarizeQuarantine([], TODAY)).toEqual({ inQuarantine: 0, checkDue: 0, awaitingResults: 0, flagged: 0 });
  });
});
