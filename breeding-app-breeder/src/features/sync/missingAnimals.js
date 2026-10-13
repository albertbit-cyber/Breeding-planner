// Animals that pairings or breeding cards name but the collection does not have.
//
// A pairing or card keeps its animals by id. When the animal itself never reached this device or
// the server (kept on one device only, or never entered), the reference points at nothing: the
// server keeps such a card with an "unresolved_animal_reference" review flag, and the keeper needs a
// way to settle it. These helpers find the dangling ids and remove the links on request; they
// never guess.

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

const cycleAnimalIds = (cycle) => {
  const ids = [text(cycle?.femaleId)];
  (Array.isArray(cycle?.males) ? cycle.males : []).forEach((male) => ids.push(text(male?.maleId)));
  (Array.isArray(cycle?.sessions) ? cycle.sessions : []).forEach((session) => ids.push(text(session?.maleId)));
  (Array.isArray(cycle?.plannedPairings) ? cycle.plannedPairings : []).forEach((planned) => ids.push(text(planned?.maleId)));
  (Array.isArray(cycle?.offspring) ? cycle.offspring : []).forEach((item) => {
    ids.push(text(item?.animalId));
    ids.push(text(item?.sireAssignment?.maleId));
  });
  return ids.filter(Boolean);
};

/**
 * The ids pairings and cards name that are not animals in `snakes`, each with the pairings and cards
 * that name it. Demo records and deleted records are ignored.
 */
export function findMissingAnimalReferences({ snakes = [], pairings = [], cycles = [] } = {}) {
  const known = new Set((Array.isArray(snakes) ? snakes : []).map((snake) => text(snake?.id)).filter(Boolean));
  const byId = new Map();
  const entry = (animalId) => {
    if (!byId.has(animalId)) byId.set(animalId, { animalId, pairingIds: [], cycleIds: [] });
    return byId.get(animalId);
  };
  (Array.isArray(pairings) ? pairings : []).forEach((pairing) => {
    if (!pairing || pairing.isDemo === true || pairing.deletedAt) return;
    [text(pairing.maleId), text(pairing.femaleId)].forEach((animalId) => {
      if (!animalId || known.has(animalId)) return;
      const item = entry(animalId);
      if (!item.pairingIds.includes(pairing.id)) item.pairingIds.push(pairing.id);
    });
  });
  (Array.isArray(cycles) ? cycles : []).forEach((cycle) => {
    if (!cycle || cycle.deletedAt) return;
    cycleAnimalIds(cycle).forEach((animalId) => {
      if (known.has(animalId)) return;
      const item = entry(animalId);
      if (!item.cycleIds.includes(cycle.id)) item.cycleIds.push(cycle.id);
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.animalId.localeCompare(b.animalId));
}

/**
 * Removes the link to `animalId` from every pairing, keeping its name: the id moves into
 * maleName / femaleName, which the pairing views show when there is no linked animal, so the
 * keeper still sees who was involved. Returns the same array when no pairing named it.
 */
export function unlinkAnimalFromPairings(pairings = [], animalId) {
  const id = text(animalId);
  if (!id || !Array.isArray(pairings)) return pairings;
  let changed = false;
  const next = pairings.map((pairing) => {
    if (!pairing) return pairing;
    let updated = pairing;
    if (text(pairing.maleId) === id) {
      updated = { ...updated, maleId: '', maleName: text(pairing.maleName) || id };
    }
    if (text(pairing.femaleId) === id) {
      updated = { ...updated, femaleId: '', femaleName: text(pairing.femaleName) || id };
    }
    if (updated !== pairing) changed = true;
    return updated;
  });
  return changed ? next : pairings;
}
