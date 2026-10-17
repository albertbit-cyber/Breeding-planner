// Giving an animal a new ID, everywhere the old one was written down.
//
// The ID is the key. Sync matches records by it, breeding cards name their female, males and
// offspring by it, and a follicle exam names its female by it. Sexing a hatchling changes it
// (26-U-242 becomes 26-M-242, see animalIdSex.js), and so does typing a new code in the edit card.
//
// A rename that only replaced the record on this device left the old ID alive on the server, and
// the next sync brought it back beside the new one: the keeper saw the unsexed hatchling and the
// sexed one side by side. The old ID has to be deleted for sync exactly as a delete would be.
//
// Everything here is pure, and every function hands back the same array when nothing in it named
// the old ID, so the setters' "unchanged list, no re-render" rule still holds.

const text = (value) => (value == null ? '' : String(value).trim());

/**
 * The sync tombstone for the ID being given up. Same shape as the one a delete writes, so the
 * server removes the old row and every other device drops its copy on the next pull.
 */
export function renameTombstone(oldId, { now }) {
  const id = text(oldId);
  return { id, appAnimalId: id, deletedAt: now };
}

const swap = (value, oldId, newId) => (text(value) === oldId ? newId : value);

function renameInCycle(cycle, oldId, newId) {
  if (!cycle || typeof cycle !== 'object' || cycle.deletedAt) return cycle;
  let touched = false;
  const swapTracked = (value) => {
    const next = swap(value, oldId, newId);
    if (next !== value) touched = true;
    return next;
  };
  const mapList = (list, fn) => (Array.isArray(list) ? list.map(fn) : list);
  const next = {
    ...cycle,
    femaleId: swapTracked(cycle.femaleId),
    males: mapList(cycle.males, (m) => (m && text(m.maleId) === oldId ? { ...m, maleId: swapTracked(m.maleId) } : m)),
    sessions: mapList(cycle.sessions, (s) => (s && text(s.maleId) === oldId ? { ...s, maleId: swapTracked(s.maleId) } : s)),
    plannedPairings: mapList(cycle.plannedPairings, (p) => (p && text(p.maleId) === oldId ? { ...p, maleId: swapTracked(p.maleId) } : p)),
    offspring: mapList(cycle.offspring, (o) => {
      if (!o) return o;
      const animalId = swapTracked(o.animalId);
      const sire = o.sireAssignment;
      const maleId = sire ? swapTracked(sire.maleId) : undefined;
      if (animalId === o.animalId && (!sire || maleId === sire.maleId)) return o;
      return { ...o, animalId, ...(sire ? { sireAssignment: { ...sire, maleId } } : {}) };
    }),
  };
  return touched ? next : cycle;
}

/** Breeding cards: the female, the males on the card, each session and planned pairing, and the offspring with their sires. */
export function renameAnimalInCycles(cycles, oldId, newId) {
  const from = text(oldId);
  const to = text(newId);
  if (!Array.isArray(cycles) || !from || !to || from === to) return cycles;
  let changed = false;
  const next = cycles.map((cycle) => {
    const renamed = renameInCycle(cycle, from, to);
    if (renamed !== cycle) changed = true;
    return renamed;
  });
  return changed ? next : cycles;
}

/** Follicle exams name their female. */
export function renameAnimalInExams(exams, oldId, newId) {
  const from = text(oldId);
  const to = text(newId);
  if (!Array.isArray(exams) || !from || !to || from === to) return exams;
  let changed = false;
  const next = exams.map((exam) => {
    if (!exam || exam.deletedAt || text(exam.femaleId) !== from) return exam;
    changed = true;
    return { ...exam, femaleId: to };
  });
  return changed ? next : exams;
}
