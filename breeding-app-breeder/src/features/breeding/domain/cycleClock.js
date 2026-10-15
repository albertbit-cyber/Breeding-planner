/**
 * The cycle clock: which milestone to watch for next, and how far along the female is.
 *
 * Fixed keeper rules, not a prediction. The clock exists to tell the breeder when to check the
 * female; biology can be a few days off either way.
 *
 *   ovulation      → pre-lay shed   21 days
 *   pre-lay shed   → eggs laid      30 days
 *   eggs laid      → hatching       60 days
 *
 * Nothing predicts ovulation: the clock starts when ovulation is logged, and every milestone
 * logged after that restarts it toward the next one. A milestone that was never logged is not
 * chased; the clock always counts from the latest one that was (shed logged without ovulation
 * counts from the shed).
 *
 * Past due is strict to the rule: the expected day is day 21, 30 or 60, and the day after it is
 * "1 day past due". Two days before the expected day the card says to watch now. The first two
 * days past due are a warning; from the third day on it is overdue.
 */
import { addDays, diffDays, todayYmd } from './dates';
import { CYCLE_STATUS, recordedEventDate } from './cycleModel';

export const CYCLE_CLOCK_RULES = Object.freeze([
  { anchor: 'ovulation', target: 'pre_lay_shed', days: 21 },
  { anchor: 'pre_lay_shed', target: 'egg_laying', days: 30 },
  { anchor: 'egg_laying', target: 'first_hatch', days: 60 },
]);

/** Days before the expected day when the card starts saying "watch now". */
export const WATCH_DAYS_BEFORE = 2;
/** Past-due days shown as a warning before they turn overdue. */
export const WARNING_DAYS_LATE = 2;

function hatched(cycle) {
  return !!(recordedEventDate(cycle, 'first_hatch') || cycle?.clutch?.firstHatchDate || cycle?.clutch?.outcomeComplete);
}

/**
 * The clock for one card, or null when there is nothing to count toward: a closed or
 * live-bearing card, a clutch that hatched, or no ovulation logged yet.
 *
 * state: 'upcoming' | 'watch' | 'due' | 'late' (1–2 days past due) | 'overdue' (3+ days)
 */
export function cycleClock(cycle, today = todayYmd()) {
  if (!cycle || cycle.deletedAt || cycle.status === CYCLE_STATUS.CLOSED) return null;
  if (cycle.reproductionMode === 'live_bearing' || hatched(cycle)) return null;
  for (let i = CYCLE_CLOCK_RULES.length - 1; i >= 0; i -= 1) {
    const rule = CYCLE_CLOCK_RULES[i];
    const anchorDate = recordedEventDate(cycle, rule.anchor);
    if (!anchorDate) continue;
    if (recordedEventDate(cycle, rule.target)) return null;
    const dueDate = addDays(anchorDate, rule.days);
    const day = diffDays(anchorDate, today);
    const daysUntil = diffDays(today, dueDate);
    const daysLate = daysUntil < 0 ? -daysUntil : 0;
    let state = 'upcoming';
    if (daysUntil === 0) state = 'due';
    else if (daysUntil > 0 && daysUntil <= WATCH_DAYS_BEFORE) state = 'watch';
    else if (daysLate > 0 && daysLate <= WARNING_DAYS_LATE) state = 'late';
    else if (daysLate > WARNING_DAYS_LATE) state = 'overdue';
    return {
      anchor: rule.anchor,
      anchorDate,
      target: rule.target,
      totalDays: rule.days,
      dueDate,
      day,
      daysUntil,
      daysLate,
      progress: Math.max(0, Math.min(1, day / rule.days)),
      state,
    };
  }
  return null;
}
