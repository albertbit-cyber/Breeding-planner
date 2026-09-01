// MorphMarket's `Category*` -> Serpentora's canonical species id.
//
// Deliberately NOT built on resolveSpeciesId: that helper falls back to ball python for
// anything it does not know, which is right for reading stored records and catastrophic here.
// An unrecognised category has to come back as null so the importer can flag the row instead of
// filing a crested gecko into the ball python workspace.

import { listSpecies } from '../../../genetics/speciesRegistry';

function normalizeCategory(raw: unknown): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Crude but sufficient de-pluralisation of the final word, so "Ball Pythons" and "Ball Python"
 * are the same key. Serpentora's own catalogue names are plural; MorphMarket's are too, but a
 * keeper editing a sheet by hand often writes the singular.
 */
function singularize(normalized: string): string {
  const words = normalized.split(' ');
  const last = words[words.length - 1] || '';
  let singular = last;
  if (/ies$/.test(last)) singular = `${last.slice(0, -3)}y`;
  else if (/(s|x|z|ch|sh)es$/.test(last)) singular = last.slice(0, -2);
  else if (/[^s]s$/.test(last)) singular = last.slice(0, -1);
  words[words.length - 1] = singular;
  return words.join(' ');
}

function keysFor(value: unknown): string[] {
  const normalized = normalizeCategory(value);
  if (!normalized) return [];
  const singular = singularize(normalized);
  return singular && singular !== normalized ? [normalized, singular] : [normalized];
}

/**
 * Categories whose MorphMarket wording does not match Serpentora's own name closely enough for
 * the generic matcher. Add to this table as categories are verified against a real export --
 * a wrong guess here files animals into the wrong species silently, which is the one outcome
 * this module exists to prevent.
 */
const EXPLICIT_CATEGORY_ALIASES: Record<string, string> = {
  'ball python': 'ball-python',
  'royal python': 'ball-python',
  'python regius': 'ball-python',
};

let lookupCache: Map<string, string> | null = null;

function buildLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  listSpecies().forEach(species => {
    const register = (value: unknown) => {
      keysFor(value).forEach(key => {
        if (!lookup.has(key)) lookup.set(key, species.id);
      });
    };
    register(species.name);
    register(species.id.replace(/-/g, ' '));
    (species.variants || []).forEach(register);
  });
  // Explicit aliases win over anything the catalogue happened to generate.
  Object.entries(EXPLICIT_CATEGORY_ALIASES).forEach(([alias, speciesId]) => {
    keysFor(alias).forEach(key => lookup.set(key, speciesId));
  });
  return lookup;
}

/**
 * Resolves a MorphMarket category to a canonical Serpentora species id, or null when we cannot
 * be sure. Null means "ask the keeper", never "assume ball python".
 */
export function resolveSpeciesFromCategory(category: unknown): string | null {
  const keys = keysFor(category);
  if (!keys.length) return null;
  if (!lookupCache) lookupCache = buildLookup();
  for (const key of keys) {
    const match = lookupCache.get(key);
    if (match) return match;
  }
  return null;
}

/** Test seam: the catalogue is static at runtime, so the cache is only ever rebuilt in tests. */
export function resetSpeciesCategoryCache(): void {
  lookupCache = null;
}
