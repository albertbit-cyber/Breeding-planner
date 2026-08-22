// Builds the multi-species trait database from the transcribed Morphpedia tables.
//
//   node scripts/species/buildSpeciesDatabase.mjs
//
// Emits breeding-app-breeder/src/config/species/:
//   index.json          full taxonomy + which species carry trait data
//   <species-id>.json   one trait table per species
//
// Ball pythons are a merge, not a regeneration. The existing curated table carries aliases,
// complex membership, super forms, health flags and notes that Morphpedia does not publish;
// this script layers year/rarity/corrected-inheritance on top and would rather fail loudly
// than drop a curated field.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPECIES_TRAITS, TYPE_CODES, RARITY_VALUES, TOTAL_EXPECTED_TRAITS } from './morphpediaTraits.mjs';
import { TAXONOMY, SCIENTIFIC_NAMES, LIVE_BEARING_SPECIES } from './speciesTaxonomy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
// Generated output lands inside the app that consumes it. breeding-app-shared is not wired
// into any app's build (nothing imports it), so emitting there would produce a database no
// app could load. The single source of truth is this scripts/ directory, not the output.
const OUT_DIR = join(REPO, 'breeding-app-breeder', 'src', 'config', 'species');
// Curated ball python data lives here as build INPUT, not as app config -- the app must
// import only the generated table, otherwise there are two runtime databases again.
const CURATED_BALL_PYTHON = join(HERE, 'sources', 'ballPythonCurated.json');

const GENERATED_AT = '2026-08-10';
const SOURCE = 'MorphMarket Morphpedia (morphmarket.com/morphpedia/), compiled 2026-08-10';

// Provenance is per species, not global. Every species transcribed so far came from
// Morphpedia, whose published per-species counts are what `expectedCount` asserts against --
// that assertion is the reason the ball python table can be trusted. A species sourced
// anywhere else must say so here, and must NOT reuse the Morphpedia attribution: an invented
// expectedCount asserts a list against itself and proves nothing.
const speciesSource = (speciesId) => SPECIES_TRAITS[speciesId]?.source || SOURCE;

const problems = [];
const fail = (msg) => problems.push(msg);

// --- parse -------------------------------------------------------------------------------

const parseRow = (row, speciesId) => {
  const parts = row.split('|');
  if (parts.length !== 4) {
    fail(`${speciesId}: malformed row "${row}" (expected 4 fields, got ${parts.length})`);
    return null;
  }
  const [geneName, code, year, rarity] = parts.map((p) => p.trim());
  if (!geneName) {
    fail(`${speciesId}: row with empty name: "${row}"`);
    return null;
  }
  const geneType = TYPE_CODES[code];
  if (!geneType) {
    fail(`${speciesId}: "${geneName}" has unknown type code "${code}"`);
    return null;
  }
  if (rarity && !RARITY_VALUES.includes(rarity)) {
    fail(`${speciesId}: "${geneName}" has unknown rarity "${rarity}"`);
    return null;
  }
  return {
    geneName,
    geneType,
    complex: null,
    hasSuperForm: false,
    superGeneName: null,
    aliases: [],
    shorthand: [],
    healthFlags: [],
    yearDiscovered: year || null,
    rarity: rarity || null,
    notes: null,
  };
};

const parsed = {};
let total = 0;
for (const [speciesId, table] of Object.entries(SPECIES_TRAITS)) {
  const genes = table.rows.map((r) => parseRow(r, speciesId)).filter(Boolean);

  const seen = new Set();
  for (const g of genes) {
    if (seen.has(g.geneName)) fail(`${speciesId}: duplicate trait "${g.geneName}"`);
    seen.add(g.geneName);
  }
  if (genes.length !== table.expectedCount) {
    fail(`${speciesId}: expected ${table.expectedCount} traits, transcribed ${genes.length}`);
  }
  parsed[speciesId] = genes;
  total += genes.length;
}
if (total !== TOTAL_EXPECTED_TRAITS) {
  fail(`total traits: expected ${TOTAL_EXPECTED_TRAITS}, transcribed ${total}`);
}

// --- ball python merge -------------------------------------------------------------------

// Real ball python genes that Morphpedia simply does not list. They are ordinary entries in
// the database, not discrepancies -- so they are not flagged and not reported as anomalies.
// Any OTHER curated-only gene still gets surfaced, so a genuine surprise can't slip through.
const EXPECTED_NON_MORPHPEDIA_GENES = new Set(['Sugar', 'Sentinel']);

const CURATED_FIELDS = [
  'complex', 'hasSuperForm', 'superGeneName', 'aliases', 'shorthand', 'healthFlags',
  'equivalentNames', 'notes',
];

const mergeBallPython = () => {
  const curated = JSON.parse(readFileSync(CURATED_BALL_PYTHON, 'utf8'));
  const byName = new Map(curated.genes.map((g) => [g.geneName, g]));
  const fromPdf = new Map(parsed['ball-python'].map((g) => [g.geneName, g]));

  const merged = [];
  for (const [name, curatedGene] of byName) {
    const pdf = fromPdf.get(name);
    merged.push({
      ...curatedGene,
      // Morphpedia distinguishes Other / Locality / Physical; the curated table collapsed all
      // of them into `polygenic`. Trust Morphpedia on inheritance, keep curated everything else.
      geneType: pdf ? pdf.geneType : curatedGene.geneType,
      yearDiscovered: pdf ? pdf.yearDiscovered : null,
      rarity: pdf ? pdf.rarity : null,
      sourceOnlyInCurated: pdf || EXPECTED_NON_MORPHPEDIA_GENES.has(name) ? undefined : true,
    });
  }
  for (const [name, pdfGene] of fromPdf) {
    if (!byName.has(name)) {
      merged.push({ ...pdfGene, sourceOnlyInMorphpedia: true });
    }
  }

  const onlyCurated = merged.filter((g) => g.sourceOnlyInCurated).map((g) => g.geneName);
  const onlyPdf = merged.filter((g) => g.sourceOnlyInMorphpedia).map((g) => g.geneName);
  const expected = [...EXPECTED_NON_MORPHPEDIA_GENES].filter((n) => byName.has(n));
  if (expected.length) console.log(`  ball-python: ${expected.length} known non-Morphpedia gene(s) included: ${expected.join(', ')}`);
  if (onlyCurated.length) console.log(`  ball-python: ${onlyCurated.length} UNEXPECTED curated-only trait(s): ${onlyCurated.join(', ')}`);
  if (onlyPdf.length) console.log(`  ball-python: ${onlyPdf.length} Morphpedia-only trait(s): ${onlyPdf.join(', ')}`);

  // No curated field may be lost in the merge.
  for (const g of merged) {
    if (g.sourceOnlyInMorphpedia) continue;
    const before = byName.get(g.geneName);
    for (const f of CURATED_FIELDS) {
      if (JSON.stringify(before[f]) !== JSON.stringify(g[f])) {
        fail(`ball-python: merge altered curated field "${f}" on "${g.geneName}"`);
      }
    }
  }

  merged.sort((a, b) => a.geneName.localeCompare(b.geneName));
  return { genes: merged, curatedGroups: curated.groups };
};

// --- grouping ----------------------------------------------------------------------------

const GROUP_KEY = {
  recessive: 'recessiveGenes',
  incomplete_dominant: 'incompleteDominantGenes',
  dominant: 'dominantGenes',
  polygenic: 'polygenicGenes',
  locality: 'localityGenes',
  physical: 'physicalGenes',
  other: 'otherGenes',
};

const buildGroups = (genes) => {
  const groups = {};
  for (const key of Object.values(GROUP_KEY)) groups[key] = [];
  for (const g of genes) groups[GROUP_KEY[g.geneType]].push(g.geneName);
  return groups;
};

// --- emit --------------------------------------------------------------------------------

const speciesIndex = [];
const taxonomyIds = new Set();
for (const group of TAXONOMY) {
  for (const s of group.species) {
    if (taxonomyIds.has(s.id)) fail(`taxonomy: duplicate species id "${s.id}"`);
    taxonomyIds.add(s.id);
  }
}
for (const id of Object.keys(SPECIES_TRAITS)) {
  if (!taxonomyIds.has(id)) fail(`"${id}" has a trait table but no taxonomy entry`);
}

if (problems.length) {
  console.error('Build aborted:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const ballPython = mergeBallPython();

for (const group of TAXONOMY) {
  for (const s of group.species) {
    const isBallPython = s.id === 'ball-python';
    const genes = isBallPython ? ballPython.genes : (parsed[s.id] || null);
    const hasTraits = Boolean(genes);

    speciesIndex.push({
      id: s.id,
      name: s.name,
      group: group.id,
      groupName: group.name,
      scientificName: SCIENTIFIC_NAMES[s.id] || null,
      reproduction: LIVE_BEARING_SPECIES.has(s.id) ? 'live_bearing' : 'egg_laying',
      variants: s.variants || [],
      traitCount: hasTraits ? genes.length : 0,
      traitsFile: hasTraits ? `${s.id}.json` : null,
    });

    if (!hasTraits) continue;

    const doc = {
      version: 1,
      generatedAt: GENERATED_AT,
      source: speciesSource(s.id),
      speciesId: s.id,
      speciesName: s.name,
      scientificName: SCIENTIFIC_NAMES[s.id] || null,
      genes,
      groups: isBallPython
        ? { ...ballPython.curatedGroups, ...buildGroups(genes) }
        : buildGroups(genes),
    };
    writeFileSync(join(OUT_DIR, `${s.id}.json`), JSON.stringify(doc, null, 2) + '\n');
  }
}

writeFileSync(
  join(OUT_DIR, 'index.json'),
  JSON.stringify({
    version: 1,
    generatedAt: GENERATED_AT,
    source: SOURCE,
    groups: TAXONOMY.map((g) => ({
      id: g.id,
      name: g.name,
      sourceNote: g.sourceNote || null,
      speciesIds: g.species.map((s) => s.id),
    })),
    species: speciesIndex,
  }, null, 2) + '\n',
);

const withTraits = speciesIndex.filter((s) => s.traitsFile);
console.log(`Wrote ${readdirSync(OUT_DIR).length} files to ${OUT_DIR}`);
console.log(`  ${speciesIndex.length} species in taxonomy, ${withTraits.length} with trait tables`);
console.log(`  ${withTraits.reduce((n, s) => n + s.traitCount, 0)} traits total`);
