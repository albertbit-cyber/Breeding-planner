/**
 * How a catalog page names an animal's parents and the genetics they carry.
 *
 * An animal can carry its parentage in three shapes, written at different times:
 * `sireId`/`damId` pointing into the collection, a snapshot taken when the clutch
 * was logged (`parentGenetics`, or `metadata.parents`), and the flat `sireName` /
 * `sireGenetics` pair. They disagree, and which one is right depends on why they
 * differ:
 *
 * The live collection record wins. Genetics get corrected after a clutch is
 * logged -- a het proven out, a morph identified once the animal colours up --
 * and the snapshot keeps showing the old reading forever. The snapshot is the
 * fallback for parents that have since left the collection or were never in it,
 * which is the only case where it holds something the collection cannot.
 */

/** Genetics reach us as a token array on snapshots and as a string elsewhere. */
export function catalogGeneticsText(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean).join(', ');
  }
  return String(value || '').trim();
}

/**
 * Builds the "Name — genetics" line for one parent, or whichever half is known.
 *
 * @param animal          the catalog subject, not the parent
 * @param role            'sire' or 'dam'
 * @param snakeById       Map of the whole collection, keyed by id; may be null
 * @param resolveGenetics reads a displayable genetics string off a full animal
 * @returns the label, or '' when nothing is recorded about that parent
 */
export function resolveCatalogParent(animal, role, snakeById = null, resolveGenetics = null) {
  const none = { name: '', genetics: '' };
  if (!animal || typeof animal !== 'object') return none;
  if (role !== 'sire' && role !== 'dam') return none;

  const idKey = role === 'sire' ? 'sireId' : 'damId';
  const nameKey = role === 'sire' ? 'sireName' : 'damName';
  const geneticsKey = role === 'sire' ? 'sireGenetics' : 'damGenetics';

  const parentId = animal[idKey];
  const liveParent = (parentId && snakeById && typeof snakeById.get === 'function')
    ? (snakeById.get(parentId) || null)
    : null;
  const snapshot = animal?.parentGenetics?.[role] || animal?.metadata?.parents?.[role] || null;

  const name = String(
    (liveParent && (liveParent.name || liveParent.id))
    || animal[nameKey]
    || (snapshot && (snapshot.name || snapshot.id))
    || ''
  ).trim();

  const readGenetics = typeof resolveGenetics === 'function' ? resolveGenetics : catalogGeneticsText;
  const genetics = liveParent
    ? catalogGeneticsText(readGenetics(liveParent))
    : (catalogGeneticsText(snapshot && snapshot.genetics)
      || catalogGeneticsText(animal[geneticsKey])
      || (snapshot ? catalogGeneticsText(readGenetics(snapshot)) : ''));

  return { name, genetics };
}

/** The same parent as one line, for callers that want a single string. */
export function resolveCatalogParentLabel(animal, role, snakeById = null, resolveGenetics = null) {
  const { name, genetics } = resolveCatalogParent(animal, role, snakeById, resolveGenetics);
  if (name && genetics) return `${name} — ${genetics}`;
  return name || genetics || '';
}
