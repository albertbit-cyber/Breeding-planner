/**
 * Breeding cards seen through the shape the older screens read.
 *
 * The Breeding dashboard, the incubator's egg boxes and the clutch-card PDF were written against
 * legacy pairing records (appointments, ovulation, preLayShed, clutch, hatch). Since the cards
 * are now the one record of a female's cycle, those screens are fed a read-only view of each
 * card in that shape instead of keeping a second copy. Nothing here is ever saved.
 *
 * Incubator bookkeeping (the clutch number, egg box notes and bad eggs) of a card that came from
 * a legacy pairing stays on that pairing, where it was entered; `bookkeeping` says which record
 * holds it so edits go back to the same place.
 */
import { CYCLE_STATUS, MALE_STATE, recordedEventDate, observedLocks, actualSessions } from './cycleModel';
import { compareYmd } from './dates';

const asArray = (value) => (Array.isArray(value) ? value : []);

/** The male shown for a card: the latest participating one, otherwise the latest candidate. */
export function displayMaleId(cycle) {
  const sessions = actualSessions(cycle);
  if (sessions.length) return sessions[sessions.length - 1].maleId || null;
  const participated = asArray(cycle?.males).filter((m) => m.state === MALE_STATE.PARTICIPATED);
  const pool = participated.length ? participated : asArray(cycle?.males);
  return pool.length ? pool[pool.length - 1].maleId : null;
}

/** The legacy pairing that holds this card's clutch bookkeeping, when there is one. */
export function legacyClutchPairing(cycle, pairingsById) {
  const ids = asArray(cycle?.legacy?.pairingIds);
  for (const id of ids) {
    const pairing = pairingsById?.get?.(id);
    if (pairing?.clutch?.date) return pairing;
  }
  return null;
}

export function layDate(cycle) {
  return recordedEventDate(cycle, 'egg_laying') || null;
}

/** Eggs in the incubator: laid, not hatched yet, card still open. */
export function isIncubating(cycle) {
  if (!cycle || cycle.deletedAt || cycle.status === CYCLE_STATUS.CLOSED) return false;
  if (cycle.reproductionMode === 'live_bearing') return false;
  if (!layDate(cycle)) return false;
  return !cycle.clutch?.firstHatchDate && !recordedEventDate(cycle, 'first_hatch') && !cycle.clutch?.outcomeComplete;
}

export function cycleToPairingView(cycle, { pairingsById = null, maleId = undefined } = {}) {
  if (!cycle) return null;
  const legacy = legacyClutchPairing(cycle, pairingsById);
  const legacyClutch = legacy?.clutch || null;
  const sessions = actualSessions(cycle);
  const locks = observedLocks(cycle);
  const appointments = sessions.map((session) => {
    const firstLock = locks.find((l) => l.sessionId === session.id) || null;
    return {
      id: session.id,
      date: session.introductionDate,
      pairingDate: session.introductionDate,
      appointmentDone: true,
      pairingObserved: true,
      lockObserved: !!firstLock,
      lockDate: firstLock?.observationDate || '',
      notes: session.notes || '',
      maleId: session.maleId || null,
    };
  });
  // Every further observed lock on a session still counts for "latest lock".
  locks.forEach((lock) => {
    if (appointments.some((a) => a.id === lock.sessionId && a.lockDate === lock.observationDate)) return;
    appointments.push({ id: `${lock.sessionId}-${lock.id}`, date: lock.observationDate, appointmentDone: true, lockObserved: true, lockDate: lock.observationDate, maleId: lock.maleId || null });
  });
  appointments.sort((a, b) => compareYmd(a.date, b.date));

  const ovulationDate = recordedEventDate(cycle, 'ovulation');
  const shedDate = recordedEventDate(cycle, 'pre_lay_shed');
  const laid = layDate(cycle);
  const hatchDate = cycle.clutch?.firstHatchDate || recordedEventDate(cycle, 'first_hatch') || null;
  const clutch = cycle.clutch || {};
  const bookkeeping = legacyClutch ? 'legacy' : 'cycle';
  const male = maleId === undefined ? displayMaleId(cycle) : maleId;

  return {
    id: cycle.id,
    cycleId: cycle.id,
    isCycleView: true,
    bookkeeping,
    bookkeepingPairingId: legacy?.id || null,
    femaleId: cycle.femaleId,
    maleId: male,
    label: cycle.legacy?.label || '',
    startDate: cycle.startDate || '',
    seasonLabel: cycle.seasonLabel || '',
    workflowStatus: cycle.status === CYCLE_STATUS.CLOSED ? 'completed' : 'active',
    appointments,
    ovulation: { observed: !!ovulationDate, date: ovulationDate || '' },
    preLayShed: { observed: !!shedDate, date: shedDate || '' },
    clutch: {
      recorded: !!laid,
      date: laid || '',
      eggsTotal: clutch.eggsTotal ?? '',
      fertileEggs: clutch.fertileEggs ?? '',
      slugs: clutch.slugs ?? '',
      notes: (legacyClutch ? legacyClutch.notes : clutch.notes) || '',
      clutchNumber: (legacyClutch ? Number(legacyClutch.clutchNumber) : clutch.clutchNumber) || null,
      eggBoxNumber: (legacyClutch ? Number(legacyClutch.eggBoxNumber) : clutch.eggBoxNumber) || null,
      eggBoxNotes: (legacyClutch ? legacyClutch.eggBoxNotes : clutch.eggBoxNotes) || {},
      eggBoxBadEggs: (legacyClutch ? legacyClutch.eggBoxBadEggs : clutch.eggBoxBadEggs) || {},
    },
    hatch: {
      recorded: !!hatchDate,
      date: hatchDate || '',
      hatchedCount: clutch.hatchlingsRecorded ?? '',
    },
  };
}

/**
 * Clutches laid on cards that have no number yet get the next free one, above every number in
 * use on cards and legacy pairings alike. A number, once given, is never changed.
 */
export function clutchNumbersToAssign(cycles = [], pairings = [], { pairingsById = null } = {}) {
  let max = 0;
  asArray(pairings).forEach((p) => { max = Math.max(max, Number(p?.clutch?.eggBoxNumber) || 0, Number(p?.clutch?.clutchNumber) || 0); });
  asArray(cycles).forEach((c) => { max = Math.max(max, Number(c?.clutch?.eggBoxNumber) || 0, Number(c?.clutch?.clutchNumber) || 0); });
  const missing = asArray(cycles)
    .filter((c) => c && !c.deletedAt && layDate(c) && !c.clutch?.clutchNumber && !legacyClutchPairing(c, pairingsById))
    .sort((a, b) => compareYmd(layDate(a), layDate(b)) || String(a.id).localeCompare(String(b.id)));
  return missing.map((cycle) => { max += 1; return { id: cycle.id, number: max }; });
}
