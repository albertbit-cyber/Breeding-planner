/**
 * Rewriting the sex marker inside an animal's ID.
 *
 * A hatchling comes out of the egg unsexed, so its generated ID carries the unknown marker:
 * `26-U-242`. Months later the keeper probes it and picks Male in the edit card, and the ID has
 * to follow -- `26-M-242`. Only the marker moves. The year, the gene initials and above all the
 * sequence number stay exactly where they were, because the number is what the keeper wrote on
 * the tub label.
 *
 * That rules out regenerating the ID from the template: regeneration rebuilds every segment, so
 * genetics entered in the same sitting would shift `[GEN3]`, and an animal whose `idSequence` was
 * never recorded (imports, hand-typed IDs) would be handed a brand new number. So this module
 * only ever substitutes one span of the existing string.
 *
 * Finding that span happens two ways, in this order:
 *
 *  1. By position, from the ID template. `[SEX]` sits at a known place between known separators,
 *     so a generated ID gives up its sex slot exactly -- even when a gene initial elsewhere in
 *     the ID happens to be an M or an F.
 *  2. By marker, scanning the string. This is what catches a hand-typed ID, which owes the
 *     template nothing. The keeper may have written the sex as a word, a letter or a ratio, so
 *     all three are recognised and the answer is written back in the same dialect and casing.
 *
 * When neither finds a sex marker the ID is returned untouched. An ID that does not state a sex
 * is not wrong once the animal is sexed, and silently rewriting a keeper's own labelling scheme
 * would be worse than leaving it alone.
 */

import { normalizeSexValue } from './animalSex';

/** The three dialects a keeper might have written the sex in. Keyed by canonical sex code. */
const SEX_AS_LETTER = { M: 'M', F: 'F', U: 'U' };
const SEX_AS_WORD = { M: 'male', F: 'female', U: 'unknown' };
const SEX_AS_RATIO = { M: '10', F: '01', U: '00' };

/**
 * A sex marker, in any dialect, that is not glued to surrounding alphanumerics.
 *
 * The guards matter more than the alternatives do. Without them the bare-letter branch would
 * fire on the F in `26F-U-242` (a Fire hatchling) or the M in `MOJAVE-01`, and the keeper would
 * watch their ID scramble itself. Longer alternatives come first so `female` is never read as a
 * boundary-less `male`, and the ratio branch demands a separator so a plain `10` -- which is
 * almost always a sequence number -- is left alone.
 */
function sexMarkerPattern() {
  return /(?<![A-Za-z0-9])(?:female|male|unknown|unk|[01][.:/][01]|[MFU])(?![A-Za-z0-9])/gi;
}

function escapeRegexSpecial(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mirrors `ensureTemplateHasSequence` in App.jsx: generated IDs always end up with a [SEQ]. */
function ensureSequenceToken(template) {
  const base = String(template || '').trim();
  if (!base) return '';
  if (/\[SEQ\]/i.test(base)) return base;
  if (/(?:-|_|\.|#|\/|\s)$/.test(base)) return `${base}[SEQ]`;
  return `${base}-[SEQ]`;
}

/**
 * Applies the casing of `sample` to `value`, so a swap keeps the keeper's own shouting or
 * lowercasing rather than imposing one.
 */
function matchCase(value, sample) {
  const letters = String(sample).replace(/[^A-Za-z]/g, '');
  if (!letters) return value;
  if (letters === letters.toUpperCase()) return value.toUpperCase();
  if (letters === letters.toLowerCase()) return value.toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** The marker for `targetSex`, written in the same dialect and casing as the marker it replaces. */
function replacementForMarker(markerText, targetSex) {
  const marker = String(markerText);
  const lower = marker.toLowerCase();

  if (lower === 'female' || lower === 'male' || lower === 'unknown') {
    return matchCase(SEX_AS_WORD[targetSex], marker);
  }
  // "Unk" abbreviates unknown and has no male or female counterpart, so a sexed animal drops
  // back to the letter dialect it is closest to.
  if (lower === 'unk') {
    return matchCase(targetSex === 'U' ? 'unk' : SEX_AS_LETTER[targetSex], marker);
  }
  if (/^[01][.:/][01]$/.test(lower)) {
    const separator = marker.charAt(1);
    const ratio = SEX_AS_RATIO[targetSex];
    return `${ratio.charAt(0)}${separator}${ratio.charAt(1)}`;
  }
  return matchCase(SEX_AS_LETTER[targetSex], marker);
}

/**
 * A regex splitting an ID into (everything before the sex slot)(the slot)(everything after),
 * derived from the ID template. Returns null when the template has no single [SEX] slot to
 * anchor on -- two of them, or none, and position proves nothing.
 */
function buildSexSlotRegex(template) {
  const ensured = ensureSequenceToken(template);
  if (!ensured || !/\[SEX\]/i.test(ensured)) return null;

  const tokenRegex = /\[([A-Z0-9-]+)\]/gi;
  const before = [];
  const after = [];
  let target = before;
  let sexSeen = false;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(ensured)) !== null) {
    const staticChunk = ensured.slice(lastIndex, match.index);
    if (staticChunk) target.push(escapeRegexSpecial(staticChunk));
    const tokenName = (match[1] || '').toUpperCase();
    if (tokenName === 'SEX') {
      if (sexSeen) return null;
      sexSeen = true;
      target = after;
    } else if (tokenName === '-') {
      target.push('(?:-)');
    } else if (tokenName === 'SEQ') {
      target.push('(?:\\d+)');
    } else {
      target.push('(?:.*?)');
    }
    lastIndex = match.index + match[0].length;
  }

  const trailing = ensured.slice(lastIndex);
  if (trailing) target.push(escapeRegexSpecial(trailing));
  if (!sexSeen) return null;

  return new RegExp(`^(${before.join('')})([A-Za-z0-9])(${after.join('')})$`, 'i');
}

/**
 * Rewrites the sex marker in `currentId` to `nextSex`, or returns the ID unchanged when it does
 * not state a sex.
 *
 * @param {string} currentId The ID as it stands.
 * @param {string} nextSex Any form `normalizeSexValue` understands.
 * @param {{ template?: string }} [options] The keeper's ID template, used to locate the slot by
 *   position before falling back to scanning for a marker.
 * @returns {string} The rewritten ID, or `currentId` untouched.
 */
export function retagIdForSex(currentId, nextSex, options = {}) {
  const id = String(currentId ?? '');
  if (!id.trim()) return id;
  const targetSex = normalizeSexValue(nextSex);

  const slotRegex = buildSexSlotRegex(options.template);
  if (slotRegex) {
    const positional = slotRegex.exec(id);
    // The slot is one character wide whatever the template puts there, so a hand-typed ID can
    // land in it by coincidence. Only act when what is sitting there really is a sex code.
    if (positional && /^[MFU]$/i.test(positional[2])) {
      return `${positional[1]}${replacementForMarker(positional[2], targetSex)}${positional[3]}`;
    }
  }

  const markers = Array.from(id.matchAll(sexMarkerPattern()));
  // Two markers and there is no telling which one is the sex, so nothing is touched.
  if (markers.length !== 1) return id;
  const marker = markers[0];
  return id.slice(0, marker.index)
    + replacementForMarker(marker[0], targetSex)
    + id.slice(marker.index + marker[0].length);
}

/** True when the ID states a sex at all, and so would move if the animal were sexed. */
export function idStatesSex(currentId, options = {}) {
  const id = String(currentId ?? '');
  if (!id.trim()) return false;
  return retagIdForSex(id, 'M', options) !== id || retagIdForSex(id, 'F', options) !== id;
}
