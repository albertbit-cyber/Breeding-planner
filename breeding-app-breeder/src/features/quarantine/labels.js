// Display strings and shared visual vocabulary for the quarantine feature.
//
// Kept in one place so the section, the panel, the check sheet and the clearance dialog cannot
// drift into calling the same value three different things. Every label goes through i18n with an
// English default, matching how the rest of App.jsx is written.

import { QUARANTINE_STATUS } from '../../services/quarantine';

export const SOURCE_LABELS = {
  'own-collection': ['quarantine.source.ownCollection', 'Bred here'],
  'known-breeder': ['quarantine.source.knownBreeder', 'Known breeder'],
  shop: ['quarantine.source.shop', 'Shop'],
  expo: ['quarantine.source.expo', 'Expo or show'],
  import: ['quarantine.source.import', 'Import'],
  'wild-caught': ['quarantine.source.wildCaught', 'Wild-caught'],
  unknown: ['quarantine.source.unknown', 'Unknown'],
};

export const SOURCE_NOTES = {
  'own-collection': ['quarantine.sourceNote.ownCollection', 'Hatched in your own collection — nothing to quarantine against.'],
  'known-breeder': ['quarantine.sourceNote.knownBreeder', 'A breeder whose room and practices you know.'],
  shop: ['quarantine.sourceNote.shop', 'Mixed stock and shared airspace, with unknown sources upstream.'],
  expo: ['quarantine.sourceNote.expo', 'Shared tables and handling with dozens of other collections.'],
  import: ['quarantine.sourceNote.import', 'Long transport, mixed shipments, high stress on arrival.'],
  'wild-caught': ['quarantine.sourceNote.wildCaught', 'Assume parasites. Extended observation and repeat faecals.'],
  unknown: ['quarantine.sourceNote.unknown', 'Treated as medium risk until you know more.'],
};

export const RISK_TONES = {
  none: 'neutral',
  low: 'good',
  medium: 'watch',
  high: 'alert',
};

export const CHECK_FIELD_LABELS = {
  mites: ['quarantine.check.mites', 'Mites'],
  breathing: ['quarantine.check.breathing', 'Breathing'],
  stool: ['quarantine.check.stool', 'Stool'],
  shed: ['quarantine.check.shed', 'Shed'],
};

export const CHECK_VALUE_LABELS = {
  none: ['quarantine.checkValue.none', 'None'],
  seen: ['quarantine.checkValue.seen', 'Seen'],
  normal: ['quarantine.checkValue.normal', 'Normal'],
  noisy: ['quarantine.checkValue.noisy', 'Noisy'],
  abnormal: ['quarantine.checkValue.abnormal', 'Abnormal'],
  'in-shed': ['quarantine.checkValue.inShed', 'In shed'],
  'shed-clean': ['quarantine.checkValue.shedClean', 'Clean shed'],
  'shed-stuck': ['quarantine.checkValue.shedStuck', 'Stuck shed'],
};

export const INTAKE_CHECK_LABELS = {
  mites: ['quarantine.intake.mites', 'Mites — eyes, vent, under scales'],
  eyes: ['quarantine.intake.eyes', 'Eyes clear, not sunken'],
  breathing: ['quarantine.intake.breathing', 'Breathing quiet, no discharge'],
  condition: ['quarantine.intake.condition', 'Body condition'],
  vent: ['quarantine.intake.vent', 'Vent clean'],
  skin: ['quarantine.intake.skin', 'Skin, scales, retained shed'],
};

export const CLEARANCE_LABELS = {
  duration: ['quarantine.clearance.duration', 'Planned duration served'],
  'clean-test': ['quarantine.clearance.cleanTest', 'At least one clear test on file'],
  'final-test': ['quarantine.clearance.finalTest', 'A clear test in the last 30 days'],
  weight: ['quarantine.clearance.weight', 'Weight stable or gaining'],
  feeding: ['quarantine.clearance.feeding', 'Feeding in the last 30 days'],
  mites: ['quarantine.clearance.mites', 'No mites since the last treatment'],
};

export const STATUS_LABELS = {
  [QUARANTINE_STATUS.NONE]: ['quarantine.statusNone', 'No quarantine'],
  [QUARANTINE_STATUS.IN]: ['quarantine.statusIn', 'In quarantine'],
  [QUARANTINE_STATUS.CLEARED]: ['quarantine.statusCleared', 'Cleared'],
};

export const TEST_RESULT_LABELS = {
  pending: ['quarantine.result.pending', 'Awaiting result'],
  clear: ['quarantine.result.clear', 'Clear'],
  positive: ['quarantine.result.positive', 'Positive'],
  inconclusive: ['quarantine.result.inconclusive', 'Inconclusive'],
};

export const TEST_RESULT_CLASSES = {
  pending: 'border-sky-200 bg-sky-50 text-sky-700',
  clear: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  positive: 'border-rose-200 bg-rose-50 text-rose-700',
  inconclusive: 'border-amber-200 bg-amber-50 text-amber-700',
};

// One phrasing everywhere. It appears under the drawings, under the lab list and at the foot of
// the quarantine tab, and three near-identical wordings would read as three different claims.
export const DISCLAIMER_LINE = [
  'quarantine.disclaimer',
  'Records and prompts only — not veterinary advice. When concerns arise, ask a vet who specialises in reptiles.',
];

// Shown beside a finding, where someone is most tempted to reach a conclusion on their own.
export const FLAG_DISCLAIMER = [
  'quarantine.flagDisclaimer',
  'Flagged, not diagnosed. One sign can have several causes. Worth a reptile vet’s opinion rather than a guess.',
];

/** Builds a `t`-bound lookup so components read `label(SOURCE_LABELS, key)` instead of tuples. */
export function makeLabeller(t) {
  return (dictionary, key, fallback = '—') => {
    const entry = dictionary[key];
    if (!entry) return fallback;
    return t(entry[0], { defaultValue: entry[1] });
  };
}

/** Renders a standalone `[key, default]` tuple such as DISCLAIMER_LINE. */
export function translateTuple(t, tuple) {
  return t(tuple[0], { defaultValue: tuple[1] });
}

export function formatYmd(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function sexSymbol(sex) {
  const normalized = String(sex || '').trim().toUpperCase().charAt(0);
  if (normalized === 'M') return '♂';
  if (normalized === 'F') return '♀';
  return '?';
}
