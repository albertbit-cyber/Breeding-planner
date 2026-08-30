import { DEFAULT_SPECIES_ID } from '../../genetics/speciesRegistry';

/** Case-insensitive de-duplicating union of trimmed strings. */
function mergeArrayValues(...values) {
  const merged = [];
  const seen = new Set();
  values.flatMap(value => (Array.isArray(value) ? value : [])).forEach((item) => {
    const normalized = String(item || '').trim();
    if (!normalized || seen.has(normalized.toLowerCase())) return;
    seen.add(normalized.toLowerCase());
    merged.push(normalized);
  });
  return merged;
}

/**
 * Groups belong to one species. A keeper names their own -- a crested gecko collection has no
 * use for "Hatchlings 2025" invented for ball pythons -- so a species new to the collection
 * starts with an EMPTY list rather than inheriting anyone else's.
 */
/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeGroupNames(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  list.forEach((entry) => {
    const name = String(entry ?? '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  });
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string[]>}
 */
export function normalizeGroupsBySpecies(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  Object.entries(source).forEach(([speciesId, names]) => {
    const id = String(speciesId || '').trim();
    if (!id) return;
    out[id] = normalizeGroupNames(names);
  });
  return out;
}

/**
 * Turns the pre-multi-species flat list into per-species buckets. Everything recorded before
 * species existed belongs to ball python, which is the species those animals already resolve
 * to -- so the groups land with the animals that use them.
 */
/**
 * @param {unknown} flatGroups
 * @param {unknown} existing
 * @returns {Record<string, string[]>}
 */
export function migrateFlatGroups(flatGroups, existing) {
  const bySpecies = normalizeGroupsBySpecies(existing);
  if (Object.keys(bySpecies).length) return bySpecies;
  const legacy = normalizeGroupNames(flatGroups);
  return legacy.length ? { [DEFAULT_SPECIES_ID]: legacy } : {};
}

/**
 * Flat union of every species' groups, written alongside the per-species map purely so older
 * clients -- the shipped Android build reads this field -- keep working instead of losing the
 * list. Nothing in this app reads it back.
 */
/**
 * @param {unknown} bySpecies
 * @returns {string[]}
 */
export function flattenGroupsBySpecies(bySpecies) {
  const out = [];
  const seen = new Set();
  Object.values(normalizeGroupsBySpecies(bySpecies)).forEach((names) => {
    names.forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
  });
  return out;
}

/** Unions each species' group list independently, so one species cannot clobber another. */
/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {Record<string, string[]>}
 */
export function mergeGroupsBySpecies(a, b) {
  const left = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  const right = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const merged = {};
  new Set([...Object.keys(left), ...Object.keys(right)]).forEach((speciesId) => {
    merged[speciesId] = mergeArrayValues(left[speciesId], right[speciesId]);
  });
  return merged;
}
