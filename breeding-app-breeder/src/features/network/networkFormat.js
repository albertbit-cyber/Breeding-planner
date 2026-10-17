/**
 * Pure helpers shared by the network screens: who a person is in one line, which animals may be
 * offered, how a split reads. Kept out of the components so they can be tested on their own.
 */
import { isOutOfCollection } from '../animals/archive.js';
import { normalizeSexValue } from '../animals/animalSex.js';

export const TRANSFER_KINDS = ['sale', 'gift', 'trade', 'loan'];
export const SPLIT_METHODS = ['alternate_picks', 'percentage', 'fixed_count', 'custom'];

/** "Alice's Pythons" or "@alice". */
export function personName(person) {
  if (!person) return '';
  return person.displayName || (person.handle ? `@${person.handle}` : '');
}

/** One or two letters for the round avatar. */
export function initialsOf(person) {
  const name = String(person?.displayName || person?.handle || '?').replace(/^@/, '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

/** A handle as people type it: no @, lower case, no spaces. */
export function cleanHandleInput(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase().replace(/\s+/g, '');
}

/** The same rule the server applies, so the form can say what is wrong before asking. */
export function handleInputProblem(handle) {
  if (!handle) return 'empty';
  if (handle.length < 3) return 'short';
  if (handle.length > 24) return 'long';
  if (!/^[a-z][a-z0-9_.]*$/.test(handle) || /\.\.|\.$/.test(handle)) return 'characters';
  return null;
}

/** An animal that belongs to someone else while it sits in this collection. */
export function isForeignRecord(animal) {
  return Boolean(animal?.partnerRecord || animal?.loan?.role === 'borrowed');
}

/** Lent out right now. */
export function isLentOut(animal) {
  return Boolean(animal?.loanedTo && String(animal?.status || '').toLowerCase() === 'on loan');
}

/** Animals the keeper may offer to another breeder: in the collection and really theirs. */
export function transferableAnimals(animals) {
  return (Array.isArray(animals) ? animals : []).filter(
    (animal) => animal && animal.id && !isOutOfCollection(animal) && !isForeignRecord(animal) && !isLentOut(animal) && animal.isDemo !== true,
  );
}

/** Animals that can join a joint project: transferable and sexed. `sex` limits to M or F. */
export function projectAnimals(animals, sex = null) {
  return transferableAnimals(animals).filter((animal) => {
    const value = normalizeSexValue(animal.sex);
    return sex ? value === sex : value === 'M' || value === 'F';
  });
}

/** Genes in one short line: morphs, then hets. */
export function genesLine(animal) {
  if (!animal) return '';
  const morphs = Array.isArray(animal.morphs) ? animal.morphs : [];
  const hets = (Array.isArray(animal.hets) ? animal.hets : []).map((gene) => (/^het\s/i.test(gene) ? gene : `het ${gene}`));
  return [...morphs, ...hets].filter(Boolean).join(' · ');
}

/** The shareable card of a local animal, as the server accepts it in a message. */
export function animalCardOf(animal) {
  const photo = [animal?.imageUrl, ...(Array.isArray(animal?.photos) ? animal.photos.map((p) => (typeof p === 'string' ? p : p?.url)) : [])]
    .reverse()
    .find((url) => typeof url === 'string' && /^https?:\/\//i.test(url));
  return {
    appAnimalId: animal?.id || '',
    name: animal?.name || animal?.id || '',
    sex: animal?.sex || '',
    species: animal?.species || '',
    morphs: Array.isArray(animal?.morphs) ? animal.morphs.slice(0, 30) : [],
    hets: Array.isArray(animal?.hets) ? animal.hets.slice(0, 30) : [],
    possibleHets: Array.isArray(animal?.possibleHets) ? animal.possibleHets.slice(0, 30) : [],
    year: animal?.year ? String(animal.year) : null,
    imageUrl: photo || null,
  };
}

/** Whether a kind moves the sender's animal to their archive. */
export function isPermanentKind(kind) {
  return kind === 'sale' || kind === 'gift' || kind === 'trade' || kind === 'split';
}

/** The split in one sentence, the way the server writes it into the hatchlings' records. */
export function describeSplit(terms, maleOwner, keeper, t) {
  if (!terms) return '';
  // Without i18n (tests, a helper caller) the English default is used, filled in the same way.
  const tr = typeof t === 'function'
    ? t
    : (key, opts = {}) => String(opts.defaultValue || key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts[name] ?? ''));
  const note = terms.note ? ` ${terms.note}` : '';
  switch (terms.method) {
    case 'alternate_picks':
      return tr('network.split.sentence.alternate', {
        defaultValue: 'Alternate picks, {{first}} first.',
        first: terms.firstPick === 'male_owner' ? maleOwner : keeper,
      }) + note;
    case 'percentage':
      return tr('network.split.sentence.percentage', {
        defaultValue: '{{male}} {{maleShare}}%, {{keeper}} {{keeperShare}}%.',
        male: maleOwner,
        keeper,
        maleShare: terms.maleOwnerShare,
        keeperShare: 100 - Number(terms.maleOwnerShare || 0),
      }) + note;
    case 'fixed_count':
      return tr('network.split.sentence.count', {
        defaultValue: '{{male}} receives {{count}} hatchlings, {{keeper}} keeps the rest.',
        male: maleOwner,
        keeper,
        count: terms.maleOwnerShare,
      }) + note;
    default:
      return terms.note || tr('network.split.sentence.custom', { defaultValue: 'Own terms.' });
  }
}

/** How many hatchlings the male owner gets under the terms, when the terms say a number. */
export function partnerShareCount(terms, hatchlingCount) {
  const total = Math.max(0, Number(hatchlingCount) || 0);
  if (!terms || !total) return null;
  if (terms.method === 'fixed_count') return Math.min(total, Math.max(0, Number(terms.maleOwnerShare) || 0));
  if (terms.method === 'percentage') return Math.round((total * Math.max(0, Math.min(100, Number(terms.maleOwnerShare) || 0))) / 100);
  if (terms.method === 'alternate_picks') return terms.firstPick === 'male_owner' ? Math.ceil(total / 2) : Math.floor(total / 2);
  return null;
}

/** "14:05", "Mon", or "12 Mar" -- short, for lists. */
export function shortTime(value, locale, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 6) return date.toLocaleDateString(locale, { weekday: 'short' });
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function shortDate(value, locale) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
