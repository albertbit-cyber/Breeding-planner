/**
 * The animal archive: snakes that have left the collection but whose record is kept.
 *
 * One rule decides "archived", and everything else asks it: an animal is archived when it
 * carries an `archive` record, or when its status is one of the leaving statuses. The status
 * half is what moves the snakes already marked Sold or Deceased into the archive without a
 * migration, and what lets a marketplace sale (which the server records by setting the status
 * to "Sold") land there too. The server counts the same statuses to keep archived animals out
 * of the plan's animal limit, so the two lists must not drift apart.
 *
 * What may change once archived (agreed with the owner, option D):
 *   - the snake's history (logs, genetics, photos, breeding) is frozen;
 *   - the exit details stay correctable, and the buyer's contact can be erased (GDPR);
 *   - dated notes can be added, never edited or removed;
 *   - the snake can come back only as a recorded "returned" event, which keeps the period.
 */

export const ARCHIVE_REASONS = Object.freeze(['sold', 'died', 'given_away', 'traded', 'lost', 'other']);

/**
 * The status each reason writes. Only three distinct values on purpose: "Given away", "Traded"
 * or "Lost" as statuses could collide with a keeper's own custom status tag and silently archive
 * live animals. The reason itself lives in the archive record.
 */
export const ARCHIVE_STATUS_BY_REASON = Object.freeze({
  sold: 'Sold',
  died: 'Deceased',
  given_away: 'Archived',
  traded: 'Archived',
  lost: 'Archived',
  other: 'Archived',
});

/** Lower-case statuses that mean "no longer in the collection". Mirrored on the server. */
export const ARCHIVED_STATUSES = Object.freeze(['sold', 'deceased', 'archived', 'removed']);

/** The status of a deleted snake kept as a small lineage card. */
export const REMOVED_STATUS = 'Removed';

/** The status a snake gets when it returns to the collection. */
export const RETURNED_STATUS = 'Active';

/** Pairing completion reason written when a female in an open pairing is archived. */
export const PAIRING_REASON_BY_ARCHIVE_REASON = Object.freeze({
  sold: 'female_sold',
  died: 'female_died',
});
export const PAIRING_REASON_FALLBACK = 'female_left_collection';

/** Breeding-card closure outcome written when a female with an open card is archived. */
export const CYCLE_OUTCOME_BY_ARCHIVE_REASON = PAIRING_REASON_BY_ARCHIVE_REASON;
export const CYCLE_OUTCOME_FALLBACK = PAIRING_REASON_FALLBACK;

/** The exit-detail fields that stay editable after archiving. Everything else is frozen. */
export const EDITABLE_EXIT_FIELDS = Object.freeze([
  'reason',
  'date',
  'counterpartyName',
  'counterpartyContact',
  'price',
  'currency',
  'handover',
  'tradeReceived',
  'causeOfDeath',
  'necropsy',
  'necropsyResult',
  'circumstances',
  'note',
]);

/** Which exit fields a reason asks for. `note` is offered for every reason. */
export const EXIT_FIELDS_BY_REASON = Object.freeze({
  sold: ['counterpartyName', 'counterpartyContact', 'price', 'currency', 'handover'],
  died: ['causeOfDeath', 'necropsy', 'necropsyResult'],
  given_away: ['counterpartyName', 'counterpartyContact', 'handover'],
  traded: ['counterpartyName', 'counterpartyContact', 'tradeReceived', 'handover'],
  lost: ['circumstances'],
  other: [],
});

export const NECROPSY_VALUES = Object.freeze(['', 'yes', 'no', 'pending']);

const text = (value, max = 2000) => {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, max);
};

const isoNow = () => new Date().toISOString();

/** YYYY-MM-DD, or '' when the value is not a date. */
export function toYmd(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

const priceValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export function isArchivedStatus(status) {
  const value = text(status).toLowerCase();
  return ARCHIVED_STATUSES.includes(value);
}

/**
 * A deleted snake that is kept as a small card because other records point at it: it was in a
 * pairing, it has offspring, or it is itself someone's offspring. Its data is gone; its identity
 * (ID, name, main photo, genetics) and its family links stay so pairings and pedigrees still read.
 */
export function isRemovedAnimal(animal) {
  if (!animal || typeof animal !== 'object') return false;
  if (animal.removed && typeof animal.removed === 'object') return true;
  return text(animal.status).toLowerCase() === 'removed';
}

/** Archived or removed: either way the snake is not in the collection any more. */
export function isOutOfCollection(animal) {
  return isRemovedAnimal(animal) || isArchivedAnimal(animal);
}

export function isArchivedAnimal(animal) {
  if (!animal || typeof animal !== 'object') return false;
  if (isRemovedAnimal(animal)) return false;
  if (animal.archive && typeof animal.archive === 'object' && animal.archive.reason) return true;
  return isArchivedStatus(animal.status);
}

/** The archive reason a bare status implies, for snakes archived before the record existed. */
export function archiveReasonForStatus(status) {
  const value = text(status).toLowerCase();
  if (value === 'sold') return 'sold';
  if (value === 'deceased') return 'died';
  if (value === 'archived') return 'other';
  return null;
}

function normalizeNote(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const body = text(raw.text, 4000);
  if (!body) return null;
  return {
    id: text(raw.id, 120) || `note-${index + 1}`,
    at: text(raw.at, 40) || '',
    text: body,
  };
}

/**
 * The archive record in a predictable shape. Never invents a date: a snake that only had its
 * status set to Sold has no archive date, and its record says so rather than showing "today".
 * Read-only on purpose -- it runs on every render, and writing a synthesized record back into the
 * animal would make every device stamp a different change into the same record.
 */
export function normalizeArchiveRecord(raw, animal = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const soldVia = animal?.soldVia && typeof animal.soldVia === 'object' ? animal.soldVia : null;
  const reason = ARCHIVE_REASONS.includes(source.reason)
    ? source.reason
    : (archiveReasonForStatus(animal?.status) || 'other');
  const necropsy = NECROPSY_VALUES.includes(source.necropsy) ? source.necropsy : '';
  return {
    reason,
    date: toYmd(source.date) || toYmd(soldVia?.soldAt) || '',
    archivedAt: text(source.archivedAt, 40) || '',
    counterpartyName: text(source.counterpartyName, 200) || text(soldVia?.buyerName, 200),
    counterpartyContact: text(source.counterpartyContact, 300),
    price: priceValue(source.price) ?? priceValue(soldVia?.price),
    currency: text(source.currency, 8).toUpperCase() || text(soldVia?.currency, 8).toUpperCase(),
    handover: text(source.handover, 200) || text(soldVia?.handoverMethod, 200),
    tradeReceived: text(source.tradeReceived, 500),
    causeOfDeath: text(source.causeOfDeath, 500),
    necropsy,
    necropsyResult: text(source.necropsyResult, 2000),
    circumstances: text(source.circumstances, 2000),
    note: text(source.note, 4000),
    notes: (Array.isArray(source.notes) ? source.notes : []).map(normalizeNote).filter(Boolean),
    marketplaceSaleId: text(source.marketplaceSaleId, 160) || text(soldVia?.saleId, 160),
    closedPairingIds: Array.isArray(source.closedPairingIds) ? source.closedPairingIds.map(id => text(id, 200)).filter(Boolean) : [],
    closedCycleIds: Array.isArray(source.closedCycleIds) ? source.closedCycleIds.map(id => text(id, 200)).filter(Boolean) : [],
    erasedContactAt: text(source.erasedContactAt, 40) || '',
    updatedAt: text(source.updatedAt, 40) || '',
    // True only when someone actually filled in the archive form (or a sale wrote it). A snake
    // swept in by its status has no recorded details yet.
    recorded: Boolean(raw && typeof raw === 'object' && raw.reason),
  };
}

/** The current archive record of an archived animal, or null when it is in the collection. */
export function getArchiveRecord(animal) {
  if (!isArchivedAnimal(animal)) return null;
  return normalizeArchiveRecord(animal.archive, animal);
}

/** Earlier archive periods, each closed by a "returned" event. Oldest first. */
export function getArchiveHistory(animal) {
  const list = Array.isArray(animal?.archiveHistory) ? animal.archiveHistory : [];
  return list
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      ...normalizeArchiveRecord(entry, null),
      returnedAt: text(entry.returnedAt, 40),
      returnDate: toYmd(entry.returnDate) || toYmd(entry.returnedAt),
      returnNote: text(entry.returnNote, 4000),
    }));
}

function pickExitFields(input = {}) {
  const out = {};
  EDITABLE_EXIT_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  });
  return out;
}

function validateExit(record) {
  if (!ARCHIVE_REASONS.includes(record.reason)) throw new Error('Choose why the animal left the collection.');
  if (!record.date) throw new Error('The date is required.');
  if (record.reason === 'other' && !record.note) throw new Error('Add a note when the reason is Other.');
}

/** Stored form of a record: the normalized fields minus the render-only flag. */
function storedRecord(record) {
  const { recorded, ...rest } = record;
  return rest;
}

/**
 * The patch that archives a snake. Throws when the input is incomplete, so the form can keep
 * what the keeper typed and say why.
 */
export function buildArchivePatch(animal, input = {}, { now = isoNow(), closedPairingIds = [], closedCycleIds = [] } = {}) {
  if (!animal) throw new Error('No animal to archive.');
  if (isArchivedAnimal(animal) && animal.archive?.reason) throw new Error('This animal is already archived.');
  // Checked before normalizing, which would otherwise read an unknown reason as "other".
  if (!ARCHIVE_REASONS.includes(input.reason)) throw new Error('Choose why the animal left the collection.');
  const record = normalizeArchiveRecord({
    ...pickExitFields(input),
    archivedAt: now,
    updatedAt: now,
    closedPairingIds,
    closedCycleIds,
  }, { ...animal, status: '' });
  // A sale the marketplace already recorded keeps its link.
  if (!record.marketplaceSaleId && animal.soldVia?.saleId) record.marketplaceSaleId = text(animal.soldVia.saleId, 160);
  validateExit(record);
  return {
    status: ARCHIVE_STATUS_BY_REASON[record.reason],
    archive: storedRecord(record),
    // An archived animal is off sale everywhere.
    forSale: false,
    isForSale: false,
  };
}

/** Correct the exit details. History is untouched; only the listed fields can change. */
export function buildExitDetailsPatch(animal, input = {}, { now = isoNow() } = {}) {
  const current = getArchiveRecord(animal);
  if (!current) throw new Error('Only an archived animal has exit details.');
  if (input.reason !== undefined && !ARCHIVE_REASONS.includes(input.reason)) throw new Error('Choose why the animal left the collection.');
  const next = normalizeArchiveRecord({
    ...storedRecord(current),
    ...pickExitFields(input),
    archivedAt: current.archivedAt,
    notes: current.notes,
    updatedAt: now,
  }, { ...animal, status: '' });
  validateExit(next);
  return {
    status: ARCHIVE_STATUS_BY_REASON[next.reason],
    archive: storedRecord(next),
  };
}

/** Erase the buyer or recipient's personal data, keeping the rest of the record. */
export function buildEraseContactPatch(animal, { now = isoNow() } = {}) {
  const current = getArchiveRecord(animal);
  if (!current) throw new Error('Only an archived animal has exit details.');
  return {
    archive: storedRecord({
      ...current,
      counterpartyName: '',
      counterpartyContact: '',
      erasedContactAt: now,
      updatedAt: now,
    }),
    // The marketplace copy of the buyer's name lives here too.
    ...(animal.soldVia && typeof animal.soldVia === 'object'
      ? { soldVia: { ...animal.soldVia, buyerName: null } }
      : {}),
  };
}

/** Append a dated note. Notes are never edited or removed. */
export function buildAddNotePatch(animal, noteText, { now = isoNow(), id } = {}) {
  const current = getArchiveRecord(animal);
  if (!current) throw new Error('Only an archived animal takes archive notes.');
  const body = text(noteText, 4000);
  if (!body) throw new Error('The note is empty.');
  const note = { id: id || `note-${now}-${current.notes.length + 1}`, at: now, text: body };
  return {
    archive: storedRecord({ ...current, notes: [...current.notes, note], updatedAt: now }),
  };
}

/**
 * Bring a snake back into the collection. Not an undo: the period it spent away is kept in
 * `archiveHistory`, closed by this return.
 */
export function buildReturnPatch(animal, { date, note = '' } = {}, { now = isoNow() } = {}) {
  const current = getArchiveRecord(animal);
  if (!current) throw new Error('This animal is not archived.');
  const returnDate = toYmd(date);
  if (!returnDate) throw new Error('The return date is required.');
  const previous = Array.isArray(animal.archiveHistory) ? animal.archiveHistory : [];
  return {
    status: RETURNED_STATUS,
    archive: null,
    archiveHistory: [
      ...previous,
      { ...storedRecord(current), returnedAt: now, returnDate, returnNote: text(note, 4000) },
    ],
  };
}

/** Collection animals only: the list every day-to-day surface works from. */
export function activeAnimals(animals) {
  return (Array.isArray(animals) ? animals : []).filter(animal => animal && !isOutOfCollection(animal));
}

export function archivedAnimals(animals) {
  return (Array.isArray(animals) ? animals : []).filter(isArchivedAnimal);
}

export function pairingReasonForArchive(reason) {
  return PAIRING_REASON_BY_ARCHIVE_REASON[reason] || PAIRING_REASON_FALLBACK;
}

export function cycleOutcomeForArchive(reason) {
  return CYCLE_OUTCOME_BY_ARCHIVE_REASON[reason] || CYCLE_OUTCOME_FALLBACK;
}

/**
 * Close the open pairings of a female that leaves the collection. The breeding cycle is over:
 * no clutch or hatchlings are expected, so the pairing is completed with the archive reason.
 *
 * Only the female's pairings. A sold or dead male changes nothing for a female that may already
 * be gravid by him, so his pairings stay open and run their course.
 */
export function closePairingsForArchivedFemale(pairings, femaleId, reason, { isOpen, now = isoNow(), actorId = null } = {}) {
  const list = Array.isArray(pairings) ? pairings : [];
  const open = typeof isOpen === 'function' ? isOpen : () => true;
  const completionReason = pairingReasonForArchive(reason);
  const closedIds = [];
  const next = list.map((pairing) => {
    if (!pairing || pairing.femaleId !== femaleId || !open(pairing)) return pairing;
    closedIds.push(pairing.id);
    const history = Array.isArray(pairing.statusHistory) ? pairing.statusHistory : [];
    const from = String(pairing.workflowStatus || pairing.status || 'active').toLowerCase();
    return {
      ...pairing,
      workflowStatus: 'completed',
      status: 'completed',
      completionReason,
      outcomeConfidence: 'confirmed',
      completedAt: pairing.completedAt || now,
      completedBy: pairing.completedBy || actorId,
      completionNote: pairing.completionNote || '',
      statusHistory: [...history, { id: `status-${now}`, from, to: 'completed', at: now, actorId, reason: completionReason, confidence: 'confirmed' }],
    };
  });
  return { pairings: next, closedIds };
}

// ── Deleted snakes kept as lineage cards ──────────────────────────────────────

/**
 * Why a snake is no longer in the collection, for labels in pairings, clutches and pedigrees.
 * `kind` is "archived" (full record kept) or "removed" (deleted, card kept); null when the snake
 * is still in the collection.
 */
export function departureOf(animal) {
  if (isRemovedAnimal(animal)) {
    const removed = animal.removed && typeof animal.removed === 'object' ? animal.removed : {};
    return {
      kind: 'removed',
      reason: ARCHIVE_REASONS.includes(removed.reason) ? removed.reason : 'other',
      date: toYmd(removed.date) || toYmd(removed.at) || '',
    };
  }
  const record = getArchiveRecord(animal);
  if (!record) return null;
  return { kind: 'archived', reason: record.reason, date: record.date };
}

/**
 * Whether other records point at this snake: a pairing (or breeding card) it took part in,
 * offspring that name it as a parent, or its own parents or clutch. Any of these keeps a card.
 */
export function familyLinksOf(animal, { animals = [], pairings = [], cycles = [] } = {}) {
  if (!animal?.id) return { pairings: 0, offspring: 0, parents: 0, hasLinks: false };
  const id = animal.id;
  const ownPairings = (Array.isArray(pairings) ? pairings : [])
    .filter(p => p && !p.deletedAt && (p.femaleId === id || p.maleId === id));
  const pairingCount = ownPairings.length;
  // A breeding card mapped from a legacy pairing ("bc-legacy-<pairing id>") is the same breeding
  // seen twice, so it is counted once.
  const mirrored = new Set(ownPairings.map(p => `bc-legacy-${p.id}`));
  const cycleCount = (Array.isArray(cycles) ? cycles : [])
    .filter(c => c && !c.deletedAt && !mirrored.has(c.id) && (c.femaleId === id || (Array.isArray(c.males) && c.males.some(m => m?.maleId === id)))).length;
  const offspring = (Array.isArray(animals) ? animals : [])
    .filter(a => a && a.id !== id && (text(a.sireId) === id || text(a.damId) === id)).length;
  const parents = [animal.sireId, animal.damId].filter(v => text(v)).length;
  const inClutch = Boolean(text(animal.clutchId) || text(animal.pairingId) || text(animal.metadata?.pairingId) || text(animal.metadata?.clutchId));
  return {
    pairings: pairingCount + cycleCount,
    offspring,
    parents,
    hasLinks: pairingCount + cycleCount + offspring + parents > 0 || inClutch,
  };
}

/** What a deleted snake keeps: who it is and how it is related. Everything else is erased. */
const REMOVAL_KEEP_FIELDS = Object.freeze([
  'id', 'name', 'sex', 'species', 'morphs', 'hets', 'possibleHets',
  'sireId', 'damId', 'clutchId', 'pairingId', 'hatchlingIndex',
  'birthDate', 'hatchDate', 'year', 'tags', 'autoId', 'idSequence', 'displayId', 'isDemo',
]);

function firstPhoto(animal) {
  const photos = Array.isArray(animal?.photos) ? animal.photos.filter(p => p && (p.url || p.dataUrl)) : [];
  return photos[0] || null;
}

/**
 * The card a deleted snake leaves behind. Keeps ID, name, the main (thumbnail) photo, sex,
 * species, genetics and every family link; erases logs, notes, prices, the rest of the photos and
 * any archive record. Throws on an unknown reason so the dialog can say so.
 */
export function buildRemovalStub(animal, { reason, now = isoNow() } = {}) {
  if (!animal?.id) throw new Error('No animal to delete.');
  const chosen = reason || getArchiveRecord(animal)?.reason || 'other';
  if (!ARCHIVE_REASONS.includes(chosen)) throw new Error('Choose why the animal left the collection.');
  const stub = {};
  REMOVAL_KEEP_FIELDS.forEach((key) => {
    if (animal[key] !== undefined) stub[key] = animal[key];
  });
  const photo = firstPhoto(animal);
  const metadata = animal.metadata && typeof animal.metadata === 'object' ? animal.metadata : null;
  return {
    ...stub,
    status: REMOVED_STATUS,
    photos: photo ? [photo] : [],
    imageUrl: photo?.url || text(animal.imageUrl, 4000) || '',
    groups: [],
    logs: { feeds: [], weights: [], sheds: [], cleanings: [], meds: [] },
    ...(metadata && (metadata.pairingId || metadata.clutchId || metadata.hatchlingIndex !== undefined)
      ? { metadata: { pairingId: metadata.pairingId, clutchId: metadata.clutchId, hatchlingIndex: metadata.hatchlingIndex } }
      : {}),
    removed: { at: now, date: toYmd(now), reason: chosen },
    updatedAt: now,
  };
}

/**
 * Merge two copies of one animal when either is a deleted-snake card. Deletion is sticky: a card
 * is never merged back together with a full copy, which would hand the erased logs and photos
 * back from a device that had not synced yet. When both are cards the later one wins.
 */
export function mergeWithRemoval(a, b, timestampOf) {
  const aRemoved = isRemovedAnimal(a);
  const bRemoved = isRemovedAnimal(b);
  if (!aRemoved && !bRemoved) return null;
  if (aRemoved && bRemoved) return (timestampOf(b) > timestampOf(a)) ? b : a;
  return aRemoved ? a : b;
}
