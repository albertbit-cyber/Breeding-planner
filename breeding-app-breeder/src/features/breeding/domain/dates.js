/**
 * Date-only arithmetic for breeding records.
 *
 * Every biological date in a breeding card is a calendar day (YYYY-MM-DD) with no time of
 * day. These helpers never build a Date at midnight and read it back, which is how a
 * date-only value silently gains or loses a day across a DST change or a timezone. They
 * work on year/month/day integers and only touch Date for "today".
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(value) {
  if (typeof value !== 'string') return false;
  const match = YMD_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Accepts YYYY-MM-DD or an ISO timestamp and returns the calendar day part, or null. */
export function toYmd(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return localYmd(value);
  }
  const text = String(value).trim();
  if (!text) return null;
  const head = text.slice(0, 10);
  return isValidYmd(head) ? head : null;
}

export function parseYmdParts(value) {
  const ymd = toYmd(value);
  if (!ymd) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  return { year, month, day };
}

export function daysInMonth(year, month) {
  // month is 1-based. Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

export function localYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayYmd(now = new Date()) {
  return localYmd(now);
}

function dayNumber(parts) {
  // Days since the Unix epoch, computed in UTC so no local DST rule can shift it.
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. Null when either is missing. */
export function diffDays(from, to) {
  const a = parseYmdParts(from);
  const b = parseYmdParts(to);
  if (!a || !b) return null;
  return dayNumber(b) - dayNumber(a);
}

export function addDays(value, days) {
  const parts = parseYmdParts(value);
  if (!parts || !Number.isFinite(days)) return null;
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Math.trunc(days)));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
}

/**
 * True calendar-month arithmetic with end-of-month clamping.
 *
 * 2026-03-01 + 1 month = 2026-04-01. 2026-01-31 + 1 month = 2026-02-28 (the day is clamped to
 * the last day of the shorter month, never rolled over into March). 2028-01-31 + 1 month =
 * 2028-02-29 in a leap year. This is the rule behind "next pairing one calendar month after a
 * lock"; it is deliberately not "30 days".
 */
export function addCalendarMonths(value, months) {
  const parts = parseYmdParts(value);
  if (!parts || !Number.isFinite(months)) return null;
  const totalMonths = parts.year * 12 + (parts.month - 1) + Math.trunc(months);
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function compareYmd(a, b) {
  const da = toYmd(a);
  const db = toYmd(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da < db ? -1 : da > db ? 1 : 0;
}

export function maxYmd(...values) {
  return values.map(toYmd).filter(Boolean).sort().pop() || null;
}

export function minYmd(...values) {
  return values.map(toYmd).filter(Boolean).sort()[0] || null;
}

/** HH:MM or null. Times are optional on every record and stored separately from the date. */
export function toHm(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

export function nowIso(now = new Date()) {
  return now.toISOString();
}
