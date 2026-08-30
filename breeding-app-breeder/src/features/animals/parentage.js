/**
 * Working out an animal's sire and dam.
 *
 * Two independent sources, in this order of trust:
 *
 *  1. A clutch. Hatchlings generated from the Breeding tracker carry `pairingId` + `clutchId`,
 *     and the pairing already names the female and the male. That is a recorded fact.
 *  2. The animal's name. Generated hatchlings are named "<Dam> x <Sire> - N" and clutch IDs are
 *     built as "<Dam> x <Sire> <year>", so a name in that shape names both parents -- dam first.
 *     That is a guess, so it only ever fills a slot the keeper left empty.
 *
 * The name split is deliberately strict: exactly one separator, both sides non-empty, and the
 * matched animal's sex must fit the role. A wrong parent is worse than no parent, because it
 * propagates into the pedigree and into every genetic calculation drawn from it.
 */

import { normalizeSexValue } from './animalSex';

/** Separators that mean "crossed with": the typographic sign, and a standalone x. */
const PAIR_SEPARATOR_RE = /\s*×\s*|\s+[xX]\s+/g;

/** Trailing hatchling index on a generated name: "Runa x Confusion - 4". */
const HATCHLING_INDEX_SUFFIX_RE = /\s*-\s*\d+\s*$/;

/** Legacy generated form, kept because older records can still carry it. */
const LEGACY_HATCHLING_RE = /^\s*Hatchling\s+\d+\s*\(\s*([^()]*×[^()]*?)\s*\)\s*$/;

/** Trailing year on a clutch ID: "Runa x Confusion 2026". */
const CLUTCH_YEAR_SUFFIX_RE = /\s+(19|20)\d{2}\s*$/;

export function normalizeAnimalName(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Splits a "Dam x Sire" label into its two halves, or returns null when the label is not in
 * that shape. Handles the generated hatchling name, the legacy parenthesised form, and a
 * clutch ID with its trailing year.
 */
export function splitPairLabel(rawLabel) {
  let label = String(rawLabel ?? '').trim();
  if (!label) return null;

  const legacy = LEGACY_HATCHLING_RE.exec(label);
  if (legacy) label = legacy[1].trim();

  label = label.replace(HATCHLING_INDEX_SUFFIX_RE, '').trim();
  if (!label) return null;

  // Reset the shared regex: it is global so it carries lastIndex between calls.
  PAIR_SEPARATOR_RE.lastIndex = 0;
  const parts = label.split(PAIR_SEPARATOR_RE).map(part => String(part || '').trim());
  // More than two parts means more than one separator -- which half is the dam is then a guess,
  // and guessing here would silently attach the wrong parent.
  if (parts.length !== 2) return null;

  const damName = parts[0].replace(CLUTCH_YEAR_SUFFIX_RE, '').trim();
  const sireName = parts[1].replace(CLUTCH_YEAR_SUFFIX_RE, '').trim();
  if (!damName || !sireName) return null;

  return { damName, sireName };
}

/**
 * The one animal of `expectedSex` called `name`, or null when there is no match or several.
 * Filtering by sex first is what lets a male and a female sharing a name both resolve correctly.
 */
export function findAnimalByName(animals, name, expectedSex, excludeId = null) {
  const target = normalizeAnimalName(name);
  if (!target) return null;
  const matches = (Array.isArray(animals) ? animals : []).filter(animal => (
    animal
    && animal.id !== excludeId
    && normalizeSexValue(animal.sex) === expectedSex
    && normalizeAnimalName(animal.name) === target
  ));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Reads a "Dam x Sire" name against the collection. Returns whichever halves resolved to
 * exactly one animal of the right sex; either side may come back null.
 */
export function detectParentsFromName({ name, animals = [], excludeId = null }) {
  const split = splitPairLabel(name);
  if (!split) return { dam: null, sire: null, damName: '', sireName: '' };
  return {
    dam: findAnimalByName(animals, split.damName, 'F', excludeId),
    sire: findAnimalByName(animals, split.sireName, 'M', excludeId),
    damName: split.damName,
    sireName: split.sireName,
  };
}

/**
 * True when a group name reads as a breeders group. The `groups` field is free text, so this
 * matches by wording rather than by a fixed id -- "Breeders", "breeding stock", "Zuchttiere"
 * are all things keepers actually type.
 */
export function isBreederGroupName(rawName) {
  return /breed|zucht|riproduttor|reproduct/i.test(String(rawName ?? ''));
}

export function isBreederAnimal(animal) {
  const groups = Array.isArray(animal?.groups) ? animal.groups : [];
  return groups.some(isBreederGroupName);
}
