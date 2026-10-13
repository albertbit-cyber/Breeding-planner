/**
 * An archived animal's record: one data structure that the record page, the copied text and the
 * PDF all read, so the three can never disagree about what the record says.
 *
 * Free of React and of App.jsx so it can be tested on its own. Every user-facing word comes
 * through `t`, the i18next function, with the English as its default.
 */

import { getArchiveRecord, getArchiveHistory, isArchivedAnimal } from './archive';
import { formatSexCode } from './animalTextList';
import { normalizeSexValue } from './animalSex';

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

const byDateDesc = (a, b) => text(b.date).localeCompare(text(a.date));

const plainT = (key, options = {}) => {
  const template = options.defaultValue || key;
  // Placeholders without a value are left in place: the labels are filled in later.
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (options[name] === undefined ? match : String(options[name])));
};

/** Every label the record uses, translated once. */
export function archiveLabels(t = plainT) {
  return {
    reasons: {
      sold: t('archive.reason.sold', { defaultValue: 'Sold' }),
      died: t('archive.reason.died', { defaultValue: 'Died' }),
      given_away: t('archive.reason.givenAway', { defaultValue: 'Given away' }),
      traded: t('archive.reason.traded', { defaultValue: 'Traded' }),
      lost: t('archive.reason.lost', { defaultValue: 'Lost or escaped' }),
      other: t('archive.reason.other', { defaultValue: 'Other' }),
    },
    closure: {
      female_sold: t('archive.closure.femaleSold', { defaultValue: 'Female sold' }),
      female_died: t('archive.closure.femaleDied', { defaultValue: 'Female died' }),
      female_left_collection: t('archive.closure.femaleLeft', { defaultValue: 'Female left the collection' }),
    },
    necropsy: {
      yes: t('archive.necropsy.yes', { defaultValue: 'Done' }),
      no: t('archive.necropsy.no', { defaultValue: 'Not done' }),
      pending: t('archive.necropsy.pending', { defaultValue: 'Result pending' }),
    },
    sex: {
      M: t('archive.sex.male', { defaultValue: 'Male' }),
      F: t('archive.sex.female', { defaultValue: 'Female' }),
      U: t('archive.sex.unknown', { defaultValue: 'Unsexed' }),
    },
    recordTitle: t('archive.record.title', { defaultValue: 'Archive record' }),
    dateNotRecorded: t('archive.record.dateNotRecorded', { defaultValue: 'Date not recorded' }),
    notRecorded: t('archive.record.notRecorded', { defaultValue: 'Not recorded' }),
    identity: t('archive.record.identity', { defaultValue: 'Animal' }),
    id: t('archive.record.id', { defaultValue: 'ID' }),
    species: t('archive.record.species', { defaultValue: 'Species' }),
    sexLabel: t('archive.record.sex', { defaultValue: 'Sex' }),
    hatched: t('archive.record.hatched', { defaultValue: 'Hatched' }),
    genetics: t('archive.record.genetics', { defaultValue: 'Genetics' }),
    parents: t('archive.record.parents', { defaultValue: 'Parents' }),
    lastWeight: t('archive.record.lastWeight', { defaultValue: 'Last weight' }),
    exit: t('archive.record.exit', { defaultValue: 'Left the collection' }),
    reason: t('archive.field.reason', { defaultValue: 'Reason' }),
    date: t('archive.field.date', { defaultValue: 'Date' }),
    counterpartySold: t('archive.field.buyer', { defaultValue: 'Buyer' }),
    counterpartyOther: t('archive.field.recipient', { defaultValue: 'Recipient' }),
    contact: t('archive.field.contact', { defaultValue: 'Contact' }),
    price: t('archive.field.price', { defaultValue: 'Price' }),
    handover: t('archive.field.handover', { defaultValue: 'Handover' }),
    tradeReceived: t('archive.field.tradeReceived', { defaultValue: 'Received in trade' }),
    causeOfDeath: t('archive.field.causeOfDeath', { defaultValue: 'Cause of death' }),
    necropsyLabel: t('archive.field.necropsy', { defaultValue: 'Necropsy' }),
    necropsyResult: t('archive.field.necropsyResult', { defaultValue: 'Necropsy result' }),
    circumstances: t('archive.field.circumstances', { defaultValue: 'Circumstances' }),
    note: t('archive.field.note', { defaultValue: 'Note' }),
    contactErased: t('archive.record.contactErased', { defaultValue: 'Buyer contact erased on {{date}}' }),
    notes: t('archive.record.notes', { defaultValue: 'Notes' }),
    previousPeriods: t('archive.record.previousPeriods', { defaultValue: 'Earlier periods away' }),
    returned: t('archive.record.returned', { defaultValue: 'Returned {{date}}' }),
    feeding: t('archive.record.feeding', { defaultValue: 'Feeding' }),
    feedingSummary: t('archive.record.feedingSummary', { defaultValue: 'Feeds logged: {{count}} · refused: {{refused}}' }),
    refused: t('archive.record.refused', { defaultValue: 'Refused' }),
    noFeeds: t('archive.record.noFeeds', { defaultValue: 'No feeds were logged.' }),
    weights: t('archive.record.weights', { defaultValue: 'Weights' }),
    breeding: t('archive.record.breeding', { defaultValue: 'Breeding' }),
    noBreeding: t('archive.record.noBreeding', { defaultValue: 'No pairings were recorded.' }),
    pairedWith: t('archive.record.pairedWith', { defaultValue: 'with {{name}}' }),
    clutch: t('archive.record.clutch', { defaultValue: 'Clutch {{date}}: {{eggs}} eggs, {{fertile}} fertile' }),
    hatchedCount: t('archive.record.hatchedCount', { defaultValue: '{{count}} hatched' }),
    stillOpen: t('archive.record.stillOpen', { defaultValue: 'Still open' }),
    offspring: t('archive.record.offspring', { defaultValue: 'Offspring in the records' }),
    archivedMarker: t('archive.record.archivedMarker', { defaultValue: 'archived' }),
    generated: t('archive.record.generated', { defaultValue: 'Generated {{date}}' }),
  };
}

export function formatRecordDate(value, locale) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale || undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

export function formatRecordPrice(price, currency) {
  if (price === null || price === undefined || price === '') return '';
  const code = text(currency).toUpperCase();
  try {
    if (code) return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(Number(price));
  } catch (_) { /* an unknown code falls through to the plain form */ }
  return `${price}${code ? ` ${code}` : ''}`;
}

function geneticsLine(animal) {
  const morphs = (Array.isArray(animal?.morphs) ? animal.morphs : []).map(text).filter(Boolean);
  const hets = (Array.isArray(animal?.hets) ? animal.hets : []).map(text).filter(Boolean).map(h => (/^(het|\d+%)/i.test(h) ? h : `het ${h}`));
  const possible = (Array.isArray(animal?.possibleHets) ? animal.possibleHets : []).map(text).filter(Boolean).map(h => (/^(pos|poss|\d+%)/i.test(h) ? h : `pos het ${h}`));
  return [...morphs, ...hets, ...possible].join(', ');
}

function nameOf(animal, fallbackId = '') {
  if (!animal) return fallbackId;
  return text(animal.name) || text(animal.id) || fallbackId;
}

function feedRow(entry) {
  const food = [text(entry.feed), text(entry.size)].filter(Boolean).join(' ');
  const grams = Number(entry.weightGrams);
  return {
    date: text(entry.date),
    food,
    grams: Number.isFinite(grams) && grams > 0 ? grams : null,
    refused: entry.refused === true,
    notes: text(entry.notes),
  };
}

/**
 * Pairings in the shape the record shows. `isCompleted` is App.jsx's own rule (it derives
 * completion from the clutch and hatch as well as the status), passed in rather than copied.
 */
function pairingRows(animal, pairings, byId, isCompleted) {
  const id = animal.id;
  return (Array.isArray(pairings) ? pairings : [])
    .filter(p => p && (p.femaleId === id || p.maleId === id))
    .map((p) => {
      const partnerId = p.femaleId === id ? p.maleId : p.femaleId;
      const clutch = p.clutch || {};
      const hatch = p.hatch || {};
      const date = text(p.startDate) || text(clutch.date) || text(p.completedAt).slice(0, 10) || text(p.cycleYear);
      return {
        id: text(p.id),
        role: p.femaleId === id ? 'dam' : 'sire',
        partnerId: text(partnerId),
        partnerName: nameOf(byId.get(partnerId), text(partnerId)),
        date,
        year: text(p.cycleYear) || date.slice(0, 4),
        clutchRecorded: !!clutch.recorded,
        clutchDate: text(clutch.date),
        eggs: clutch.recorded ? Number(clutch.eggsTotal) || 0 : null,
        fertile: clutch.recorded ? Number(clutch.fertileEggs) || 0 : null,
        hatched: hatch.recorded || Number(hatch.hatchedCount) > 0 ? Number(hatch.hatchedCount) || 0 : null,
        completed: typeof isCompleted === 'function' ? !!isCompleted(p) : String(p.workflowStatus || '').toLowerCase() === 'completed',
        completionReason: text(p.completionReason),
      };
    })
    .sort(byDateDesc);
}

/**
 * Everything the record shows, resolved. `animals` is the whole collection (archived included),
 * for partner names and offspring.
 */
export function buildArchiveRecordData({ animal, animals = [], pairings = [], isPairingCompleted = null, speciesName = '' }) {
  if (!animal || !isArchivedAnimal(animal)) return null;
  const byId = new Map((Array.isArray(animals) ? animals : []).filter(Boolean).map(a => [a.id, a]));
  const logs = animal.logs || {};
  const feeds = (Array.isArray(logs.feeds) ? logs.feeds : []).map(feedRow).sort(byDateDesc);
  const weights = (Array.isArray(logs.weights) ? logs.weights : [])
    .map(entry => ({ date: text(entry.date), grams: Number(entry.grams) }))
    .filter(entry => Number.isFinite(entry.grams) && entry.grams > 0)
    .sort(byDateDesc);
  const sireId = text(animal.sireId);
  const damId = text(animal.damId);
  const offspring = (Array.isArray(animals) ? animals : [])
    .filter(a => a && a.id !== animal.id && (text(a.sireId) === animal.id || text(a.damId) === animal.id))
    .map(a => ({ id: a.id, name: nameOf(a), sex: normalizeSexValue(a.sex) || 'U', archived: isArchivedAnimal(a), birthDate: text(a.birthDate) || text(a.hatchDate) }))
    .sort((a, b) => text(b.birthDate).localeCompare(text(a.birthDate)));
  return {
    animal: {
      id: text(animal.id),
      name: text(animal.name),
      sex: normalizeSexValue(animal.sex) || 'U',
      sexCode: formatSexCode(animal.sex),
      species: text(speciesName) || text(animal.species),
      birthDate: text(animal.birthDate) || text(animal.hatchDate),
      year: text(animal.year),
      genetics: geneticsLine(animal),
      sire: sireId ? { id: sireId, name: nameOf(byId.get(sireId), sireId) } : null,
      dam: damId ? { id: damId, name: nameOf(byId.get(damId), damId) } : null,
      photo: (Array.isArray(animal.photos) && animal.photos[0]?.url) || text(animal.imageUrl) || '',
    },
    exit: getArchiveRecord(animal),
    previous: getArchiveHistory(animal),
    feeds,
    feedTotals: { count: feeds.length, refused: feeds.filter(f => f.refused).length },
    weights,
    lastWeight: weights[0] || null,
    pairings: pairingRows(animal, pairings, byId, isPairingCompleted),
    offspring,
  };
}

/** The exit details as label/value pairs, in reading order, leaving out what is empty. */
export function exitDetailRows(exit, labels, { locale } = {}) {
  if (!exit) return [];
  const rows = [];
  const push = (label, value) => { if (text(value)) rows.push({ label, value: text(value) }); };
  push(labels.reason, labels.reasons[exit.reason] || exit.reason);
  rows.push({ label: labels.date, value: exit.date ? formatRecordDate(exit.date, locale) : labels.dateNotRecorded, missing: !exit.date });
  push(exit.reason === 'sold' ? labels.counterpartySold : labels.counterpartyOther, exit.counterpartyName);
  push(labels.contact, exit.counterpartyContact);
  push(labels.price, formatRecordPrice(exit.price, exit.currency));
  push(labels.handover, exit.handover);
  push(labels.tradeReceived, exit.tradeReceived);
  push(labels.causeOfDeath, exit.causeOfDeath);
  push(labels.necropsyLabel, exit.necropsy ? labels.necropsy[exit.necropsy] : '');
  push(labels.necropsyResult, exit.necropsyResult);
  push(labels.circumstances, exit.circumstances);
  push(labels.note, exit.note);
  return rows;
}

const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, name) => (values[name] === undefined ? '' : String(values[name])));

/**
 * The record as plain text, for pasting into a message or a note. Short sections, no tables:
 * it has to read well in WhatsApp as much as in an email.
 */
export function formatArchiveRecordText(data, labels = archiveLabels(), { locale, maxFeeds = 25 } = {}) {
  if (!data) return '';
  const d = (value) => formatRecordDate(value, locale);
  const lines = [];
  const a = data.animal;
  lines.push(`${a.name || a.id}${a.name && a.id ? ` (${a.id})` : ''}`);
  lines.push([a.sexCode, labels.sex[a.sex], a.species].filter(Boolean).join(' · '));
  if (a.genetics) lines.push(a.genetics);
  if (a.birthDate) lines.push(`${labels.hatched}: ${d(a.birthDate)}`);
  if (a.sire || a.dam) lines.push(`${labels.parents}: ${[a.sire?.name, a.dam?.name].filter(Boolean).join(' × ')}`);
  if (data.lastWeight) lines.push(`${labels.lastWeight}: ${data.lastWeight.grams} g (${d(data.lastWeight.date)})`);

  lines.push('', labels.exit.toUpperCase());
  exitDetailRows(data.exit, labels, { locale }).forEach(row => lines.push(`${row.label}: ${row.value}`));
  if (data.exit?.erasedContactAt) lines.push(fill(labels.contactErased, { date: d(data.exit.erasedContactAt) }));

  if (data.exit?.notes?.length) {
    lines.push('', labels.notes.toUpperCase());
    data.exit.notes.forEach(note => lines.push(`${d(note.at)}: ${note.text}`));
  }

  if (data.previous.length) {
    lines.push('', labels.previousPeriods.toUpperCase());
    data.previous.forEach((period) => {
      lines.push(`${labels.reasons[period.reason] || period.reason} ${period.date ? d(period.date) : labels.dateNotRecorded} → ${fill(labels.returned, { date: d(period.returnDate) })}`);
    });
  }

  lines.push('', labels.feeding.toUpperCase());
  if (!data.feeds.length) {
    lines.push(labels.noFeeds);
  } else {
    lines.push(fill(labels.feedingSummary, { count: data.feedTotals.count, refused: data.feedTotals.refused }));
    data.feeds.slice(0, maxFeeds).forEach((feed) => {
      const parts = [d(feed.date), feed.refused ? labels.refused : feed.food, feed.grams ? `${feed.grams} g` : ''].filter(Boolean);
      lines.push(`- ${parts.join(' · ')}`);
    });
    if (data.feeds.length > maxFeeds) lines.push(`… +${data.feeds.length - maxFeeds}`);
  }

  lines.push('', labels.breeding.toUpperCase());
  if (!data.pairings.length) {
    lines.push(labels.noBreeding);
  } else {
    data.pairings.forEach((p) => {
      const parts = [p.year, fill(labels.pairedWith, { name: p.partnerName })];
      if (p.clutchRecorded) parts.push(fill(labels.clutch, { date: d(p.clutchDate), eggs: p.eggs, fertile: p.fertile }));
      if (p.hatched !== null) parts.push(fill(labels.hatchedCount, { count: p.hatched }));
      if (labels.closure[p.completionReason]) parts.push(labels.closure[p.completionReason]);
      if (!p.completed) parts.push(labels.stillOpen);
      lines.push(`- ${parts.filter(Boolean).join(' · ')}`);
    });
  }
  if (data.offspring.length) {
    lines.push(`${labels.offspring}: ${data.offspring.map(o => (o.archived ? `${o.name} (${labels.archivedMarker})` : o.name)).join(', ')}`);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** A file name that survives every file system: "archive-nala-26-f-186.pdf". */
export function archiveRecordFileName(data, extension = 'pdf') {
  const base = [data?.animal?.name, data?.animal?.id].filter(Boolean).join(' ') || 'animal';
  const slug = base.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `archive-${slug || 'animal'}.${extension}`;
}
