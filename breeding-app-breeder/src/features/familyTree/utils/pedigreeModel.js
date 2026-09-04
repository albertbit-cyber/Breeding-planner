/**
 * One pedigree, built once, read by every view.
 *
 * The Family Tree used to derive its graph twice over: the server returned whatever
 * `ParentRelationship` rows existed, and the page separately inferred a pedigree from the
 * animals in the browser. Whichever produced a node first won, so a successful-but-empty
 * server response blanked a perfectly good local tree. The two are merged here instead, and
 * the merge runs in one direction only: the server may fill a gap, never overwrite something
 * the keeper recorded.
 *
 * Parentage is resolved from four sources, in descending order of trust:
 *
 *   1. `sireId` / `damId` on the animal. The keeper said so. A recorded fact.
 *   2. `pairingId` -> the pairing's male and female. Also recorded, one hop away.
 *   3. The animal's name, split strictly as "<Dam> x <Sire>" by the shared parentage helper.
 *   4. A loose name match, and only against breeder-group animals.
 *
 * Anything below rank 2 is a guess and is tagged as one, so a view can draw it differently and
 * a keeper can tell a recorded parent from a deduced one.
 *
 * ── Clutches, and why they are the unit of grouping ────────────────────────────────────
 *
 * Siblings are not "the children of these two animals". They are the children of one clutch.
 * Two clutches from the same pair in different years are different sibships, and the children
 * of one shared parent by different partners are half-siblings, which belong under separate
 * junctions. Grouping on the parent pair alone collapses the first case and loses the second,
 * which is what the old builder did. So every child is assigned a `clutchKey`, and every view
 * groups on that.
 */

import { normalizeSexValue } from '../../animals/animalSex';
import { splitPairLabel, isBreederAnimal, normalizeAnimalName } from '../../animals/parentage';

export const CONFIDENCE = {
  RECORDED: 'recorded',   // the keeper set it, or a pairing states it
  INFERRED: 'inferred',   // read out of a well-formed name
  GUESSED: 'guessed',     // loose name match; drawn dashed
};

export const SEX_MALE = 'male';
export const SEX_FEMALE = 'female';
export const SEX_UNKNOWN = 'unknown';

/** The tree's own sex vocabulary. The rest of the app stores 'M' / 'F' / 'U'. */
function treeSex(raw) {
  const value = normalizeSexValue(raw);
  if (value === 'M') return SEX_MALE;
  if (value === 'F') return SEX_FEMALE;
  return SEX_UNKNOWN;
}

function geneticsOf(animal) {
  const morphs = Array.isArray(animal?.morphs) ? animal.morphs : [];
  const hets = Array.isArray(animal?.hets)
    ? animal.hets.map(entry => (/^het\b/i.test(String(entry)) ? String(entry) : `het ${entry}`))
    : [];
  const possible = Array.isArray(animal?.possibleHets)
    ? animal.possibleHets.map(entry => (/^possible/i.test(String(entry)) ? String(entry) : `possible het ${entry}`))
    : [];
  return [...morphs, ...hets, ...possible]
    .map(entry => String(entry ?? '').trim())
    .filter(Boolean);
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Normalises an app animal into the shape every node component reads. `sireId` and `damId` are
 * carried through deliberately: resolution needs them, and looking them back up on the original
 * record would mean a scan of the collection per animal.
 */
export function toTreeAnimal(animal) {
  if (!animal?.id) return null;
  return {
    id: animal.id,
    globalId: animal.globalId || null,
    localId: animal.id,
    name: animal.name || animal.id || 'Unnamed',
    species: animal.species || null,
    sex: treeSex(animal.sex),
    genetics: geneticsOf(animal),
    breederId: animal.breederId || 'local',
    breederName: animal.breederName || null,
    currentOwnerId: animal.ownerId || 'local',
    clutchId: animal.clutchId || animal.metadata?.clutchId || null,
    pairingId: animal.pairingId || animal.metadata?.pairingId || null,
    hatchlingIndex: firstFinite(animal.hatchlingIndex, animal.metadata?.hatchlingIndex),
    hatchDate: animal.birthDate || animal.hatchDate || (animal.year ? String(animal.year) : null),
    status: animal.status || (Array.isArray(animal.tags) ? animal.tags[0] : null),
    privacyLevel: 'private',
    photoUrl: animal.imageUrl || animal.photoUrl || null,
    sireId: animal.sireId || null,
    damId: animal.damId || null,
    isEgg: false,
    isBreeder: isBreederAnimal(animal),
  };
}

/** A server animal already arrives in tree shape; it only needs the extra fields defaulted. */
function fromServerAnimal(animal) {
  if (!animal?.id) return null;
  return {
    ...animal,
    sex: treeSex(animal.sex),
    genetics: Array.isArray(animal.genetics) ? animal.genetics : [],
    pairingId: animal.pairingId || null,
    hatchlingIndex: firstFinite(animal.hatchlingIndex),
    sireId: null,
    damId: null,
    isEgg: false,
    isBreeder: false,
  };
}

/** Eggs a clutch is still holding, drawn as pale cards below their hatched siblings. */
function makeEggAnimal({ clutchKey, index, sire, dam, hatchDate, clutchId }) {
  return {
    id: `egg:${clutchKey}:${index}`,
    globalId: null,
    localId: `Egg ${index}`,
    name: `Egg ${index}`,
    species: sire?.species || dam?.species || null,
    sex: SEX_UNKNOWN,
    genetics: [],
    breederId: 'local',
    breederName: null,
    currentOwnerId: 'local',
    clutchId: clutchId || null,
    pairingId: null,
    hatchlingIndex: index,
    hatchDate: hatchDate || null,
    status: 'egg',
    privacyLevel: 'private',
    photoUrl: null,
    sireId: sire?.id || null,
    damId: dam?.id || null,
    isEgg: true,
    isBreeder: false,
  };
}

// ── Clutch identity ────────────────────────────────────────────────────────────────────

/**
 * The key that decides who is a sibling of whom.
 *
 * A pairing is the strongest: one pairing carries one clutch, so every animal pointing at it
 * belongs to the same sibship. Failing that a written clutch ID groups them. Failing that the
 * parent pair itself is used, which is what keeps half-siblings apart -- the key carries both
 * parents, so the same sire by a different dam yields a different key, and so a different
 * junction.
 */
function clutchKeyFor({ pairingId, clutchId, sireId, damId }) {
  if (pairingId) return `pair:${pairingId}`;
  if (clutchId) return `cid:${normalizeAnimalName(clutchId)}`;
  if (sireId && damId) return `cross:${sireId}|${damId}`;
  if (sireId) return `solo:${sireId}`;
  if (damId) return `solo:${damId}`;
  return null;
}

// ── Names ──────────────────────────────────────────────────────────────────────────────

/**
 * Hatchlings are very often named with the year in front -- "26 Runa x Confusion - 4", and
 * "26Runa x ..." with no space. The shared `splitPairLabel` strips a trailing index and a
 * trailing year but knows nothing about a leading one, so the dam came back as "26 Runa" and
 * matched no animal at all. Every hatchling named that way silently lost both parents.
 */
const LEADING_YEAR_RE = /^(\d{4})\s+|^(\d{2})(?=[A-Za-z])|^(\d{2})\s+/;

function readYear(twoOrFourDigits) {
  const value = Number(twoOrFourDigits);
  if (!Number.isFinite(value)) return null;
  if (String(twoOrFourDigits).length === 4) return value;
  // A two-digit year: 70 and up reads as last century, anything lower as this one.
  return value >= 70 ? 1900 + value : 2000 + value;
}

/** Splits "<Dam> x <Sire>", tolerating a leading year, and reports the year if one was there. */
function splitAnimalName(rawName) {
  const text = String(rawName ?? '').trim();
  if (!text) return null;

  const match = LEADING_YEAR_RE.exec(text);
  const digits = match && (match[1] || match[2] || match[3]);
  const body = match ? text.slice(match[0].length).trim() : text;

  const split = splitPairLabel(body) || splitPairLabel(text);
  if (!split) return null;
  return { ...split, hatchYear: digits ? readYear(digits) : null };
}

// ── Parent resolution ──────────────────────────────────────────────────────────────────

/** Index of exact lowercased name -> animals, so a name lookup is not a scan per animal. */
function buildNameIndex(animals) {
  const index = new Map();
  for (const animal of animals) {
    const key = normalizeAnimalName(animal.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(animal);
  }
  return index;
}

/** Exactly one animal of the right sex called `name`, or nothing. Ambiguity resolves to null. */
function lookupByName(nameIndex, name, sex, excludeId) {
  const matches = (nameIndex.get(normalizeAnimalName(name)) || [])
    .filter(animal => animal.id !== excludeId && animal.sex === sex);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Loose match, reached only once the strict split has failed. Restricted to breeder-group
 * animals: a parent is nearly always in one, and the restriction keeps this off the hot path
 * for a collection where most animals are hatchlings.
 */
function looseLookup(breeders, name, sex, excludeId) {
  const target = normalizeAnimalName(name).replace(/[^a-z0-9]/g, '');
  if (target.length < 3) return null;
  const matches = breeders.filter(animal => {
    if (animal.id === excludeId || animal.sex !== sex) return false;
    const candidate = normalizeAnimalName(animal.name).replace(/[^a-z0-9]/g, '');
    if (candidate.length < 3) return false;
    return candidate === target || candidate.startsWith(target) || target.startsWith(candidate);
  });
  return matches.length === 1 ? matches[0] : null;
}

// ── The model ──────────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} animals   app animals, as held in the browser
 * @param {object[]} pairings  app pairings, for clutch dates and egg counts
 * @param {object}   server    optional { snakes, relationships } from the family-tree API
 */
export function buildPedigree({ animals = [], pairings = [], server = null } = {}) {
  const animalsById = new Map();

  for (const raw of animals) {
    const normalized = toTreeAnimal(raw);
    if (normalized) animalsById.set(normalized.id, normalized);
  }

  // The server fills gaps only. An animal the browser already knows keeps its local record,
  // which is the one the keeper has been editing.
  for (const raw of server?.snakes || []) {
    const normalized = fromServerAnimal(raw);
    if (normalized && !animalsById.has(normalized.id)) animalsById.set(normalized.id, normalized);
  }

  const allAnimals = [...animalsById.values()];
  const nameIndex = buildNameIndex(allAnimals);
  const breeders = allAnimals.filter(animal => animal.isBreeder);

  const pairingById = new Map();
  for (const pairing of pairings || []) {
    if (pairing?.id) pairingById.set(pairing.id, pairing);
  }

  /** childId -> { sireId, damId, confidence, clutchKey } */
  const parentsOf = new Map();
  const sexOf = id => animalsById.get(id)?.sex || SEX_UNKNOWN;

  for (const animal of allAnimals) {
    let sireId = null;
    let damId = null;
    let confidence = null;

    // 1. Recorded on the animal itself.
    if (animal.sireId && animalsById.has(animal.sireId)) {
      sireId = animal.sireId;
      confidence = CONFIDENCE.RECORDED;
    }
    if (animal.damId && animalsById.has(animal.damId)) {
      damId = animal.damId;
      confidence = CONFIDENCE.RECORDED;
    }

    // 2. Stated by the pairing the animal hatched from.
    if (!sireId || !damId) {
      const pairing = animal.pairingId ? pairingById.get(animal.pairingId) : null;
      if (pairing) {
        if (!sireId && pairing.maleId && animalsById.has(pairing.maleId)) {
          sireId = pairing.maleId;
          confidence = confidence || CONFIDENCE.RECORDED;
        }
        if (!damId && pairing.femaleId && animalsById.has(pairing.femaleId)) {
          damId = pairing.femaleId;
          confidence = confidence || CONFIDENCE.RECORDED;
        }
      }
    }

    // 3. Read out of the name, strictly. Dam first -- that is how the hatch wizard writes it.
    let split = null;
    if (!sireId || !damId) {
      split = splitAnimalName(animal.name) || splitAnimalName(animal.clutchId);
      if (split) {
        if (!sireId) {
          const found = lookupByName(nameIndex, split.sireName, SEX_MALE, animal.id);
          if (found) {
            sireId = found.id;
            confidence = confidence || CONFIDENCE.INFERRED;
          }
        }
        if (!damId) {
          const found = lookupByName(nameIndex, split.damName, SEX_FEMALE, animal.id);
          if (found) {
            damId = found.id;
            confidence = confidence || CONFIDENCE.INFERRED;
          }
        }
      }
    }

    // 4. Loose, against breeders only.
    if (split && (!sireId || !damId)) {
      if (!sireId) {
        const found = looseLookup(breeders, split.sireName, SEX_MALE, animal.id);
        if (found) {
          sireId = found.id;
          confidence = confidence || CONFIDENCE.GUESSED;
        }
      }
      if (!damId) {
        const found = looseLookup(breeders, split.damName, SEX_FEMALE, animal.id);
        if (found) {
          damId = found.id;
          confidence = confidence || CONFIDENCE.GUESSED;
        }
      }
    }

    if (sireId || damId) {
      parentsOf.set(animal.id, {
        sireId,
        damId,
        confidence: confidence || CONFIDENCE.GUESSED,
        clutchKey: null,
        nameYear: split?.hatchYear ?? null,
      });
    }
  }

  // Server relationships, folded in without displacing anything already resolved.
  for (const rel of server?.relationships || []) {
    if (!rel?.childId || !rel?.parentId) continue;
    if (!animalsById.has(rel.childId) || !animalsById.has(rel.parentId)) continue;
    const entry = parentsOf.get(rel.childId)
      || { sireId: null, damId: null, confidence: CONFIDENCE.RECORDED, clutchKey: null };
    const role = (rel.role === 'dam' || sexOf(rel.parentId) === SEX_FEMALE) ? 'damId' : 'sireId';
    if (!entry[role]) entry[role] = rel.parentId;
    parentsOf.set(rel.childId, entry);
  }

  // ── Clutches ─────────────────────────────────────────────────────────────────────────

  const clutches = new Map();
  const clutchOfChild = new Map();

  const ensureClutch = (key, seed) => {
    if (!clutches.has(key)) {
      clutches.set(key, {
        key,
        sireId: seed.sireId ?? null,
        damId: seed.damId ?? null,
        clutchId: seed.clutchId ?? null,
        pairingId: seed.pairingId ?? null,
        date: seed.date ?? null,
        childIds: [],
        eggIds: [],
        memberIds: [],
        laidCount: null,
      });
    }
    const clutch = clutches.get(key);
    // A later member may know a detail the first did not.
    if (!clutch.clutchId && seed.clutchId) clutch.clutchId = seed.clutchId;
    if (!clutch.pairingId && seed.pairingId) clutch.pairingId = seed.pairingId;
    if (!clutch.date && seed.date) clutch.date = seed.date;
    if (!clutch.sireId && seed.sireId) clutch.sireId = seed.sireId;
    if (!clutch.damId && seed.damId) clutch.damId = seed.damId;
    return clutch;
  };

  for (const animal of allAnimals) {
    const parents = parentsOf.get(animal.id);
    if (!parents) continue;
    const key = clutchKeyFor({
      pairingId: animal.pairingId,
      clutchId: animal.clutchId,
      sireId: parents.sireId,
      damId: parents.damId,
    });
    if (!key) continue;
    const clutch = ensureClutch(key, {
      sireId: parents.sireId,
      damId: parents.damId,
      clutchId: animal.clutchId,
      pairingId: animal.pairingId,
      date: animal.hatchDate || (parents.nameYear ? String(parents.nameYear) : null),
    });
    clutch.childIds.push(animal.id);
    clutchOfChild.set(animal.id, key);
    parents.clutchKey = key;
  }

  // Pairings contribute clutches of their own -- including ones that have not hatched, which
  // no animal can point at yet.
  for (const pairing of pairings || []) {
    if (!pairing?.id || !pairing?.clutch?.date) continue;
    const sireId = animalsById.has(pairing.maleId) ? pairing.maleId : null;
    const damId = animalsById.has(pairing.femaleId) ? pairing.femaleId : null;
    if (!sireId && !damId) continue;

    const key = `pair:${pairing.id}`;
    const year = String(pairing.clutch.date || '').slice(0, 4) || null;
    const damName = animalsById.get(damId)?.name || null;
    const sireName = animalsById.get(sireId)?.name || null;
    const clutch = ensureClutch(key, {
      sireId,
      damId,
      pairingId: pairing.id,
      date: pairing.clutch.date,
      clutchId: damName && sireName && year ? `${damName} x ${sireName} ${year}` : null,
    });

    const fertile = firstFinite(pairing.clutch.fertileEggs);
    const total = firstFinite(pairing.clutch.eggsTotal);
    const slugs = firstFinite(pairing.clutch.slugs) ?? 0;
    const viable = fertile ?? (total === null ? null : Math.max(0, total - slugs));
    clutch.laidCount = viable;

    // Only the eggs this clutch has not yet accounted for become egg cards. Drawing one per egg
    // laid would double every hatchling that has already come out of it.
    const unhatched = viable === null
      ? 0
      : Math.max(0, Math.min(viable, 80) - clutch.childIds.length);

    for (let i = 0; i < unhatched; i += 1) {
      const index = clutch.childIds.length + i + 1;
      const egg = makeEggAnimal({
        clutchKey: key,
        index,
        sire: animalsById.get(sireId),
        dam: animalsById.get(damId),
        hatchDate: pairing.clutch.date,
        clutchId: clutch.clutchId,
      });
      animalsById.set(egg.id, egg);
      clutch.eggIds.push(egg.id);
      parentsOf.set(egg.id, {
        sireId,
        damId,
        confidence: CONFIDENCE.RECORDED,
        clutchKey: key,
      });
      clutchOfChild.set(egg.id, key);
    }
  }

  // Order every sibship: by hatchling index where there is one, then by name.
  const orderIndex = id => {
    const value = Number(animalsById.get(id)?.hatchlingIndex);
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };
  const orderName = id => String(animalsById.get(id)?.name || id);
  const bySiblingOrder = (a, b) => {
    const ia = orderIndex(a);
    const ib = orderIndex(b);
    return ia !== ib ? ia - ib : orderName(a).localeCompare(orderName(b));
  };

  for (const clutch of clutches.values()) {
    clutch.childIds.sort(bySiblingOrder);
    clutch.memberIds = [...clutch.childIds, ...clutch.eggIds];
  }

  // ── Reverse indexes ──────────────────────────────────────────────────────────────────

  const childrenOf = new Map();
  const clutchesOfParent = new Map();

  const pushUnique = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.includes(value)) list.push(value);
  };

  for (const [childId, parents] of parentsOf) {
    pushUnique(childrenOf, parents.sireId, childId);
    pushUnique(childrenOf, parents.damId, childId);
  }
  for (const clutch of clutches.values()) {
    pushUnique(clutchesOfParent, clutch.sireId, clutch.key);
    pushUnique(clutchesOfParent, clutch.damId, clutch.key);
  }
  for (const list of childrenOf.values()) list.sort(bySiblingOrder);
  for (const list of clutchesOfParent.values()) {
    list.sort((a, b) => String(clutches.get(a)?.date || '')
      .localeCompare(String(clutches.get(b)?.date || '')));
  }

  return {
    animalsById,
    parentsOf,
    childrenOf,
    clutches,
    clutchOfChild,
    clutchesOfParent,

    // Convenience readers, so views never poke at the maps directly.
    get: id => animalsById.get(id) || null,
    parents: id => parentsOf.get(id) || { sireId: null, damId: null, confidence: null, clutchKey: null },
    children: id => childrenOf.get(id) || [],
    clutch: key => clutches.get(key) || null,
    clutchesOf: id => (clutchesOfParent.get(id) || []).map(key => clutches.get(key)).filter(Boolean),

    /** Full and half siblings of an animal, excluding itself. */
    siblings: id => {
      const key = clutchOfChild.get(id);
      const clutch = key ? clutches.get(key) : null;
      return (clutch?.memberIds || []).filter(other => other !== id);
    },
  };
}

/**
 * Generation of every animal: one past its deepest recorded parent, so an animal with nothing
 * above it sits at 0. Guarded against a record that makes an animal its own ancestor, which
 * would otherwise never return.
 */
export function computeGenerations(model) {
  const depth = new Map();
  const inProgress = new Set();

  const resolve = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (inProgress.has(id)) return 0;   // cycle: treat as a root and move on
    inProgress.add(id);

    const { sireId, damId } = model.parents(id);
    let value = 0;
    for (const parentId of [sireId, damId]) {
      if (parentId && model.get(parentId)) value = Math.max(value, resolve(parentId) + 1);
    }

    inProgress.delete(id);
    depth.set(id, value);
    return value;
  };

  for (const id of model.animalsById.keys()) resolve(id);
  return depth;
}

/** Human label for a clutch, preferring what the keeper wrote over anything derived. */
export function clutchLabel(clutch, model) {
  if (!clutch) return 'Clutch';
  if (clutch.clutchId) return clutch.clutchId;
  const dam = model?.get(clutch.damId)?.name;
  const sire = model?.get(clutch.sireId)?.name;
  const year = String(clutch.date || '').slice(0, 4);
  const names = [dam, sire].filter(Boolean).join(' x ');
  if (names && year) return `${names} ${year}`;
  return names || 'Clutch';
}

/**
 * The catalog page fills a missing sire or dam from whatever the pedigree can work out, and it
 * asks per animal while mapping over the whole collection. Building a model per call would be
 * quadratic, so the model is cached against the array it was built from -- a stable reference
 * for the length of a render, which is exactly the span that matters.
 *
 * The animals handed back are the caller's own records, not the tree's normalised copies: the
 * catalog reads `morphs` off them, which only the originals carry.
 */
const pedigreeCache = new WeakMap();

export function inferParentsForLocalSnake(child, animals = []) {
  if (!child?.id || !Array.isArray(animals) || !animals.length) return { sire: null, dam: null };

  let cached = pedigreeCache.get(animals);
  if (!cached) {
    cached = {
      model: buildPedigree({ animals }),
      byId: new Map(animals.filter(animal => animal?.id).map(animal => [animal.id, animal])),
    };
    pedigreeCache.set(animals, cached);
  }

  const { sireId, damId } = cached.model.parents(child.id);
  return {
    sire: (sireId && cached.byId.get(sireId)) || null,
    dam: (damId && cached.byId.get(damId)) || null,
  };
}
