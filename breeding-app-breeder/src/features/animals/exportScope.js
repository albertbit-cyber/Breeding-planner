/**
 * Which animals an export covers.
 *
 * A keeper building a catalog does not think "all animals" or "one group" or "these twelve" --
 * they think "the 2026 hatchlings, minus the three I'm holding back". So the scope is two steps
 * that compose rather than four modes that exclude each other: a filter picks the pool (everything,
 * some groups, some tags), then individual animals can be dropped from it.
 *
 * The second step stores what was *removed*, not what was kept. If it stored the keepers, an animal
 * added to the group tomorrow would quietly fall out of a selection the keeper believes says
 * "this group", and a catalog that silently omits an animal is worse than one that includes a
 * surprise.
 *
 * Kept free of React so the selection rules can be tested without mounting the export panel.
 */

/** Filter modes for the first step. Anything else normalises to `all`. */
export const ANIMAL_SCOPE_MODES = ['all', 'groups', 'tags'];

export const DEFAULT_ANIMAL_EXPORT_SCOPE = Object.freeze({
  mode: 'all',
  groups: [],
  tags: [],
  excludedIds: [],
});

function toStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}

/** A scope object with every field present and of the right shape, whatever came in. */
export function normalizeAnimalExportScope(scope) {
  const source = scope && typeof scope === 'object' ? scope : {};
  const mode = ANIMAL_SCOPE_MODES.includes(source.mode) ? source.mode : 'all';
  return {
    mode,
    groups: toStringArray(source.groups),
    tags: toStringArray(source.tags),
    excludedIds: toStringArray(source.excludedIds),
  };
}

function readTokens(animal, key) {
  return (Array.isArray(animal?.[key]) ? animal[key] : [])
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
}

/**
 * The group and tag names offered by the pickers, taken from the animals themselves rather than
 * from a saved group list -- a group nothing is filed under would otherwise offer itself as a
 * filter that selects zero animals.
 */
export function collectAnimalScopeOptions(animals = []) {
  const groupSet = new Set();
  const tagSet = new Set();
  (Array.isArray(animals) ? animals : []).filter(Boolean).forEach(animal => {
    readTokens(animal, 'groups').forEach(value => groupSet.add(value));
    readTokens(animal, 'tags').forEach(value => tagSet.add(value));
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return {
    groups: [...groupSet].sort((a, b) => collator.compare(a, b)),
    tags: [...tagSet].sort((a, b) => collator.compare(a, b)),
  };
}

/**
 * Step one: the pool the filter matches, before any individual animal is dropped.
 *
 * An empty picker means "nothing chosen yet" rather than "match nothing" -- falling through to
 * every animal here would export the lot under a heading that says otherwise.
 */
export function selectScopeCandidates(animals = [], scope) {
  const all = (Array.isArray(animals) ? animals : []).filter(Boolean);
  const { mode, groups, tags } = normalizeAnimalExportScope(scope);

  if (mode === 'groups') {
    if (!groups.length) return [];
    const wanted = new Set(groups);
    return all.filter(animal => readTokens(animal, 'groups').some(value => wanted.has(value)));
  }
  if (mode === 'tags') {
    if (!tags.length) return [];
    const wanted = new Set(tags);
    return all.filter(animal => readTokens(animal, 'tags').some(value => wanted.has(value)));
  }
  return all;
}

/** Step two: the pool with the individually deselected animals removed. This is what exports. */
export function selectAnimalsForExport(animals = [], scope) {
  const candidates = selectScopeCandidates(animals, scope);
  const excluded = new Set(normalizeAnimalExportScope(scope).excludedIds);
  if (!excluded.size) return candidates;
  return candidates.filter(animal => !excluded.has(String(animal?.id ?? '')));
}

/**
 * Whether the keeper reached into the list and dropped animals that the filter had matched.
 *
 * Exclusions left over from a previous filter do not count: deselecting an animal, then switching
 * to a group that animal is not in, is not a statement about the new group. The catalog leans on
 * this to decide whether the selection is deliberate enough to override its for-sale rule.
 */
export function hasExplicitAnimalPicks(animals = [], scope) {
  const excluded = new Set(normalizeAnimalExportScope(scope).excludedIds);
  if (!excluded.size) return false;
  return selectScopeCandidates(animals, scope)
    .some(animal => excluded.has(String(animal?.id ?? '')));
}

/** True once the export covers less than the whole collection, for the "back to all" affordance. */
export function isAnimalScopeNarrowed(animals = [], scope) {
  const normalized = normalizeAnimalExportScope(scope);
  if (normalized.mode !== 'all') return true;
  return hasExplicitAnimalPicks(animals, normalized);
}

/**
 * An animal the keeper has marked as available.
 *
 * Deliberately generous: the flag, the status field and the tag list are all places a keeper has
 * plausibly recorded it, and the catalog missing an animal that says "for sale" somewhere is a
 * worse failure than including one that is only half-marked.
 */
export function isAnimalForSale(animal) {
  if (!animal || typeof animal !== 'object') return false;
  if (animal.forSale === true || animal.isForSale === true) return true;
  const statusToken = String(animal.status || '').trim().toLowerCase();
  if (
    statusToken === 'for sale'
    || statusToken === 'forsale'
    || statusToken === 'for sell'
    || statusToken === 'forsell'
    || statusToken.includes('for sale')
    || statusToken.includes('for sell')
  ) {
    return true;
  }
  const tags = Array.isArray(animal.tags) ? animal.tags : [];
  return tags.some((tag) => {
    const token = String(tag || '').trim().toLowerCase();
    return token === 'for sale' || token === 'forsale' || token === 'for sell' || token === 'forsell' || token === 'sale' || token === 'available';
  });
}

/**
 * The animals the catalog will actually print, and why.
 *
 * The catalog has always narrowed to animals marked for sale, which is right when the keeper asked
 * for a whole group and expects the app to know what is available. It is wrong once they have gone
 * through the list by hand: six animals chosen one at a time is already the answer to "which
 * animals", and filtering four of them away without saying so reads as a bug. So a hand-picked
 * selection is taken at its word, and the caller shows which rule applied either way.
 */
export function resolveCatalogSelection(animals = [], scope) {
  const selected = selectAnimalsForExport(animals, scope);
  const forSale = selected.filter(isAnimalForSale);
  const handPicked = hasExplicitAnimalPicks(animals, scope);
  return {
    animals: handPicked ? selected : forSale,
    handPicked,
    selectedCount: selected.length,
    forSaleCount: forSale.length,
  };
}
