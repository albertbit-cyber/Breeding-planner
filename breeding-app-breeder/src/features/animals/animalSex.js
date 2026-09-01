/**
 * How an animal's sex is read, stored and coerced.
 *
 * Unknown is a real value, not a missing one. A hatchling out of the egg has not been sexed,
 * and a keeper can say so explicitly -- both must survive being saved, and both must reach the
 * ID generator so the [SEX] token resolves to U rather than to a guess.
 */

/** Canonical value for "not sexed yet". Matches the option value used by every sex picker. */
export const UNKNOWN_SEX = 'U';

export function normalizeSexValue(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return UNKNOWN_SEX;
  if (value === 'm' || value === 'male') return 'M';
  if (value === 'f' || value === 'female') return 'F';
  if (/^male\b/.test(value)) return 'M';
  if (/^female\b/.test(value)) return 'F';
  if (/^supermale\b/.test(value)) return 'M';
  if (/^superfemale\b/.test(value)) return 'F';
  if (/^1[\s.:/]*0$/.test(value)) return 'M';
  if (/^0[\s.:/]*1$/.test(value)) return 'F';
  if (/^m/.test(value)) return 'M';
  if (/^f/.test(value)) return 'F';
  return UNKNOWN_SEX;
}

/**
 * Sex as recorded, unknown included. Use this wherever the keeper has genuinely not said --
 * a hatchling straight out of the egg, or an animal they picked "Unknown" for. `ensureSex`
 * coerces to a fallback, which silently turned every one of those into a female.
 */
export function sexOrUnknown(raw) {
  return normalizeSexValue(raw);
}

/**
 * Sex coerced to a definite value. Only for places that cannot represent unknown -- a Punnett
 * cross needs a side. Anything that stores an animal should use `sexOrUnknown` instead.
 */
export function ensureSex(raw, fallback = 'F') {
  const normalized = normalizeSexValue(raw);
  return normalized === UNKNOWN_SEX ? fallback : normalized;
}

export function isFemaleSnake(snake) {
  return normalizeSexValue(snake?.sex) === 'F';
}

export function isMaleSnake(snake) {
  return normalizeSexValue(snake?.sex) === 'M';
}
