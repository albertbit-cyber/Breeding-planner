// How often the quarantine notice interrupts.
//
// A notice that appears every single time an animal is added stops being read after the third
// time -- people learn the shape of the dialog and click through it without seeing the words. A
// notice that can be switched off permanently gets switched off on day one and never seen again.
//
// So it does neither. It shows on the first animal that goes into quarantine, then again after a
// fresh random gap of 5 to 10 more. The gap is re-rolled every time, so it never settles into a
// rhythm anyone can anticipate and click past, and it can never be turned off entirely -- only
// spaced out. The same text stays reachable on demand from the quarantine tab.

export const NOTICE_MIN_INTERVAL = 5;
export const NOTICE_MAX_INTERVAL = 10;

function positiveInt(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
}

export function normalizeNoticeState(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const starts = positiveInt(source.starts, 0);
  // nextAt is at least 1 so a fresh install shows the notice on the very first animal.
  const nextAt = Math.max(1, positiveInt(source.nextAt, 1));
  return { starts, nextAt };
}

/** A gap of NOTICE_MIN_INTERVAL..NOTICE_MAX_INTERVAL inclusive. */
export function pickNoticeInterval(random = Math.random) {
  const span = NOTICE_MAX_INTERVAL - NOTICE_MIN_INTERVAL + 1;
  const roll = Math.floor(random() * span);
  const clamped = Math.min(span - 1, Math.max(0, Number.isFinite(roll) ? roll : 0));
  return NOTICE_MIN_INTERVAL + clamped;
}

/**
 * Counts one animal going into quarantine and reports whether the notice is due.
 * Pure: returns the next state rather than mutating, and takes its randomness as an argument so
 * the schedule can be tested exactly.
 */
export function recordQuarantineStart(rawState, random = Math.random) {
  const state = normalizeNoticeState(rawState);
  const starts = state.starts + 1;
  if (starts < state.nextAt) {
    return { state: { starts, nextAt: state.nextAt }, show: false };
  }
  return { state: { starts, nextAt: starts + pickNoticeInterval(random) }, show: true };
}
