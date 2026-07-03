import databaseJson from '../config/ballPythonGeneticsDatabase.json';

export type GeneType = 'recessive' | 'incomplete_dominant' | 'dominant' | 'polygenic';

export type HealthFlag = 'wobble' | 'lethal_super' | 'infertility' | 'kinking';

export type BallPythonGeneRecord = {
  geneName: string;
  geneType: GeneType;
  complex: string | null;
  hasSuperForm: boolean;
  superGeneName: string | null;
  aliases: string[];
  shorthand: string[];
  healthFlags: HealthFlag[];
  notes?: string;
};

export type GeneAliasRow = {
  geneName: string;
  aliases: string[];
  shorthand: string[];
};

export type BallPythonGeneGroups = {
  recessiveGenes: string[];
  incompleteDominantGenes: string[];
  dominantGenes: string[];
  polygenicGenes?: string[];
  belComplexGenes: string[];
  blkELComplexGenes?: string[];
  spiderComplexGenes?: string[];
  eightBallComplexGenes?: string[];
  mahoganyComplexGenes?: string[];
  superStripeComplexGenes?: string[];
  axanthicLines?: string[];
  acidComplexGenes?: string[];
  clownComplexGenes?: string[];
  wobbleGenes?: string[];
  lethalSuperGenes?: string[];
  yellowBellyComplexGenes?: string[];
  patternModifierGenes?: string[];
  colorEnhancerGenes?: string[];
  darkeningGenes?: string[];
  stripeLinePatternGenes?: string[];
};

export type BallPythonGeneticsDatabase = {
  version: number;
  generatedAt: string;
  genes: BallPythonGeneRecord[];
  groups: BallPythonGeneGroups;
};

type RawGeneRecord = Omit<BallPythonGeneRecord, 'aliases' | 'shorthand' | 'healthFlags'> & {
  aliases?: string[];
  shorthand?: string[];
  healthFlags?: string[];
};

type RawDatabase = Omit<BallPythonGeneticsDatabase, 'genes'> & {
  genes: RawGeneRecord[];
};

const DEFAULT_GENE_ALIAS_PRESETS: Record<string, { aliases?: string[]; shorthand?: string[] }> = {
  'pastel': { aliases: ['Pastel'], shorthand: ['PS', 'P'] },
  'super pastel': { aliases: ['Super Pastel'], shorthand: ['SPS'] },
  'orange dream': { aliases: ['Orange Dream'], shorthand: ['OD'] },
  'yellow belly': { aliases: ['Yellow Belly', 'Yellowbelly'], shorthand: ['YB'] },
  'black pastel': { aliases: ['Black Pastel'], shorthand: ['BP'] },
  'cinnamon': { aliases: ['Cinnamon'], shorthand: ['Cin', 'Cinn'] },
  'mojave': { aliases: ['Mojave'], shorthand: ['Moj'] },
  'lesser': { aliases: ['Lesser'], shorthand: ['Les'] },
  'butter': { aliases: ['Butter'], shorthand: ['But'] },
  'russo': { aliases: ['Russo'], shorthand: ['Rus'] },
  'mystic': { aliases: ['Mystic'], shorthand: ['Mys'] },
  'phantom': { aliases: ['Phantom'], shorthand: ['Phan'] },
  'special': { aliases: ['Special'], shorthand: ['Spec'] },
  'leopard': { aliases: ['Leopard'], shorthand: ['Leo'] },
  'spotnose': { aliases: ['Spotnose'], shorthand: ['SN'] },
  'pinstripe': { aliases: ['Pinstripe'], shorthand: ['Pin'] },
  'spider': { aliases: ['Spider'], shorthand: ['Spi'] },
  'enchi': { aliases: ['Enchi'], shorthand: ['En'] },
  'fire': { aliases: ['Fire'], shorthand: ['Fir'] },
  'vanilla': { aliases: ['Vanilla'], shorthand: ['Van'] },
  'red stripe': { aliases: ['Red Stripe'], shorthand: ['RS'] },
  'genetic stripe': { aliases: ['Genetic Stripe'], shorthand: ['GS'] },
  'desert ghost': { aliases: ['Desert Ghost'], shorthand: ['DG'] },
  'hypo (orange ghost)': { aliases: ['Hypo', 'Orange Ghost'], shorthand: ['OG'] },
  'clown': { aliases: ['Clown'], shorthand: ['Cln'] },
  'piebald': { aliases: ['Piebald'], shorthand: ['Pied', 'Pb'] },
  'lavender albino': { aliases: ['Lavender Albino'], shorthand: ['Lav', 'Lav Albino'] },
  'ultramel': { aliases: ['Ultramel', 'Ultramale', 'Ultra Male'], shorthand: ['UM'] },
  'monsoon': { aliases: ['Monsoon'], shorthand: ['Mons'] },
  'puzzle': { aliases: ['Puzzle'], shorthand: ['Puz'] },
  'sunset': { aliases: ['Sunset'], shorthand: ['Sun'] },
  'axanthic vpi': { aliases: ['Axanthic VPI', 'VPI Axanthic'], shorthand: ['VPI'] },
  'axanthic tsk': { aliases: ['Axanthic TSK', 'TSK Axanthic'], shorthand: ['TSK'] },
  'axanthic mj': { aliases: ['MJ Axanthic', 'Axanthic MJ'], shorthand: ['MJ'] },
  'blackhead': { aliases: ['Blackhead'], shorthand: ['BH'] },
  'ghi': { aliases: ['GHI'], shorthand: ['GHI'] },
  'mahogany': { aliases: ['Mahogany'], shorthand: ['Mah'] },
  'acid': { aliases: ['Acid'], shorthand: ['ACD'] },
  'hurricane': { aliases: ['Hurricane'], shorthand: ['Hur'] },
  'wookie': { aliases: ['Wookie'], shorthand: ['Woo'] },
  'stranger': { aliases: ['Stranger'], shorthand: ['Str'] },
  'confusion': { aliases: ['Confusion'], shorthand: ['Conf'] },
  'bongo': { aliases: ['Bongo'], shorthand: ['Bon'] },
  'cypress': { aliases: ['Cypress'], shorthand: ['Cyp'] },
  'specter': { aliases: ['Specter'], shorthand: ['Spc'] },
  'gravel': { aliases: ['Gravel'], shorthand: ['Gra'] },
  'asphalt': { aliases: ['Asphalt'], shorthand: ['Asp'] },
};

function normalizeAliasList(values: unknown): string[] {
  const arr = Array.isArray(values) ? values : [];
  const seen = new Set<string>();
  const out: string[] = [];
  arr.forEach((value) => {
    const cleaned = String(value || '').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return;
    seen.add(key);
    out.push(cleaned);
  });
  return out;
}

function normalizeGeneRecord(raw: RawGeneRecord): BallPythonGeneRecord | null {
  const geneName = String(raw?.geneName || '').trim();
  if (!geneName) return null;
  const geneKey = geneName.toLowerCase();
  const preset = DEFAULT_GENE_ALIAS_PRESETS[geneKey] || null;

  const aliases = normalizeAliasList([
    geneName,
    ...(Array.isArray(preset?.aliases) ? preset.aliases : []),
    ...(Array.isArray(raw?.aliases) ? raw.aliases : []),
  ]);
  const shorthand = normalizeAliasList([
    ...(Array.isArray(preset?.shorthand) ? preset.shorthand : []),
    ...(Array.isArray(raw?.shorthand) ? raw.shorthand : []),
  ]);

  const VALID_HEALTH_FLAGS = new Set(['wobble', 'lethal_super', 'infertility', 'kinking']);
  const healthFlags = (Array.isArray(raw.healthFlags) ? raw.healthFlags : [])
    .map(f => String(f).trim())
    .filter(f => VALID_HEALTH_FLAGS.has(f)) as HealthFlag[];

  return {
    geneName,
    geneType: raw.geneType,
    complex: raw.complex ?? null,
    hasSuperForm: Boolean(raw.hasSuperForm),
    superGeneName: raw.superGeneName ? String(raw.superGeneName).trim() : null,
    aliases,
    shorthand,
    healthFlags,
    ...(raw.notes ? { notes: String(raw.notes) } : {}),
  };
}

const RAW_DB = databaseJson as RawDatabase;
const DB: BallPythonGeneticsDatabase = {
  ...RAW_DB,
  genes: (Array.isArray(RAW_DB.genes) ? RAW_DB.genes : [])
    .map(normalizeGeneRecord)
    .filter((entry): entry is BallPythonGeneRecord => Boolean(entry)),
};

const byName = new Map<string, BallPythonGeneRecord>();
const byType = new Map<GeneType, BallPythonGeneRecord[]>();
const byComplex = new Map<string, BallPythonGeneRecord[]>();
const superNameToBase = new Map<string, BallPythonGeneRecord>();
const defaultAliasRows: GeneAliasRow[] = [];

DB.genes.forEach((gene) => {
  const key = String(gene.geneName || '').trim().toLowerCase();
  if (!key) return;
  if (!byName.has(key)) byName.set(key, gene);

  const bucket = byType.get(gene.geneType) || [];
  bucket.push(gene);
  byType.set(gene.geneType, bucket);

  if (gene.complex) {
    const complexKey = gene.complex.toLowerCase();
    const complexBucket = byComplex.get(complexKey) || [];
    complexBucket.push(gene);
    byComplex.set(complexKey, complexBucket);
  }

  if (gene.superGeneName) {
    superNameToBase.set(gene.superGeneName.trim().toLowerCase(), gene);
  }

  defaultAliasRows.push({
    geneName: gene.geneName,
    aliases: normalizeAliasList(gene.aliases),
    shorthand: normalizeAliasList(gene.shorthand),
  });
});

export const BALL_PYTHON_GENETICS_DATABASE: BallPythonGeneticsDatabase = DB;

export function normalizeGeneAliasRows(rows: unknown): GeneAliasRow[] {
  const source = Array.isArray(rows) ? rows : [];
  const out: GeneAliasRow[] = [];
  const byGene = new Map<string, GeneAliasRow>();

  source.forEach((entry: any) => {
    const geneName = String(entry?.geneName || '').trim();
    if (!geneName) return;
    const key = geneName.toLowerCase();
    const existing = byGene.get(key) || { geneName, aliases: [], shorthand: [] };
    existing.geneName = geneName;
    existing.aliases = normalizeAliasList([...existing.aliases, ...(Array.isArray(entry?.aliases) ? entry.aliases : []), geneName]);
    existing.shorthand = normalizeAliasList([...existing.shorthand, ...(Array.isArray(entry?.shorthand) ? entry.shorthand : [])]);
    byGene.set(key, existing);
  });

  byGene.forEach(value => out.push(value));
  return out.sort((a, b) => a.geneName.localeCompare(b.geneName, undefined, { sensitivity: 'base' }));
}

export function getDefaultGeneAliasRows(): GeneAliasRow[] {
  return defaultAliasRows.map(row => ({
    geneName: row.geneName,
    aliases: row.aliases.slice(),
    shorthand: row.shorthand.slice(),
  }));
}

export function mergeGeneAliasRows(customRows: unknown): GeneAliasRow[] {
  const defaults = getDefaultGeneAliasRows();
  const merged = new Map<string, GeneAliasRow>();

  defaults.forEach((row) => {
    merged.set(row.geneName.toLowerCase(), {
      geneName: row.geneName,
      aliases: normalizeAliasList(row.aliases),
      shorthand: normalizeAliasList(row.shorthand),
    });
  });

  normalizeGeneAliasRows(customRows).forEach((row) => {
    const key = row.geneName.toLowerCase();
    const prior = merged.get(key);
    if (!prior) {
      merged.set(key, {
        geneName: row.geneName,
        aliases: normalizeAliasList([row.geneName, ...row.aliases]),
        shorthand: normalizeAliasList(row.shorthand),
      });
      return;
    }
    merged.set(key, {
      geneName: prior.geneName,
      aliases: normalizeAliasList([...prior.aliases, ...row.aliases, row.geneName]),
      shorthand: normalizeAliasList([...prior.shorthand, ...row.shorthand]),
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.geneName.localeCompare(b.geneName, undefined, { sensitivity: 'base' }));
}

export function buildGeneAliasLookupMap(rows: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const normalized = normalizeGeneAliasRows(rows);

  normalized.forEach((row) => {
    const canonical = row.geneName;
    const variants = normalizeAliasList([canonical, ...row.aliases, ...row.shorthand]);
    variants.forEach((variant) => {
      const key = variant.toLowerCase();
      if (!key || map.has(key)) return;
      map.set(key, canonical);
    });
  });

  return map;
}

export function resolveGeneAliasToken(token: string, lookupMap: Map<string, string>): string | null {
  const direct = String(token || '').trim();
  if (!direct) return null;
  const key = direct.toLowerCase();
  if (lookupMap.has(key)) return lookupMap.get(key) || null;

  const compact = direct
    .replace(/[()]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!compact) return null;
  return lookupMap.get(compact) || null;
}

let ACTIVE_GENE_ALIAS_ROWS: GeneAliasRow[] = [];
let ACTIVE_GENE_ALIAS_LOOKUP = new Map<string, string>();

function ensureActiveGeneAliasResolver() {
  if (!ACTIVE_GENE_ALIAS_ROWS.length || !ACTIVE_GENE_ALIAS_LOOKUP.size) {
    const mergedDefaults = mergeGeneAliasRows(getDefaultGeneAliasRows());
    ACTIVE_GENE_ALIAS_ROWS = mergedDefaults;
    ACTIVE_GENE_ALIAS_LOOKUP = buildGeneAliasLookupMap(mergedDefaults);
  }
}

export function getActiveGeneAliasRows(): GeneAliasRow[] {
  ensureActiveGeneAliasResolver();
  return ACTIVE_GENE_ALIAS_ROWS.map(row => ({
    geneName: row.geneName,
    aliases: row.aliases.slice(),
    shorthand: row.shorthand.slice(),
  }));
}

export function setActiveGeneAliasRows(rows: unknown): GeneAliasRow[] {
  const merged = mergeGeneAliasRows(rows);
  ACTIVE_GENE_ALIAS_ROWS = merged;
  ACTIVE_GENE_ALIAS_LOOKUP = buildGeneAliasLookupMap(merged);
  return getActiveGeneAliasRows();
}

export function resolveActiveGeneAliasToken(token: string): string | null {
  ensureActiveGeneAliasResolver();
  return resolveGeneAliasToken(token, ACTIVE_GENE_ALIAS_LOOKUP);
}

export function resolveCanonicalGene(
  token: string,
  resolveCanonical?: (raw: string) => string | null
): string | null {
  const raw = String(token || '').trim();
  if (!raw) return null;
  if (typeof resolveCanonical === 'function') {
    const canonical = resolveCanonical(raw);
    if (canonical) return canonical;
  }
  return resolveActiveGeneAliasToken(raw);
}

const POSSIBLE_HET_WORDS = new Set(['possible', 'probable', 'maybe', 'ph']);

function normalizeGeneSearchPhrase(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseWords(value: string): string {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function extractTraitsFromMorphText(raw: string, rows?: unknown): string[] {
  const normalized = normalizeGeneSearchPhrase(raw);
  if (!normalized) return [];

  const aliasRows = Array.isArray(rows) && rows.length ? normalizeGeneAliasRows(rows) : getActiveGeneAliasRows();
  const phraseMap = new Map<string, string>();
  let maxAliasWords = 1;

  aliasRows.forEach((row) => {
    const canonical = String(row?.geneName || '').trim();
    if (!canonical) return;
    const variants = [canonical, ...(Array.isArray(row?.aliases) ? row.aliases : []), ...(Array.isArray(row?.shorthand) ? row.shorthand : [])];
    variants.forEach((variant) => {
      const key = normalizeGeneSearchPhrase(variant);
      if (!key || phraseMap.has(key)) return;
      phraseMap.set(key, canonical);
      const wordCount = key.split(' ').filter(Boolean).length;
      if (wordCount > maxAliasWords) {
        maxAliasWords = wordCount;
      }
    });
  });

  const words = normalized.split(' ').filter(Boolean);
  const traits: string[] = [];
  const seen = new Set<string>();

  let idx = 0;
  while (idx < words.length) {
    let matchedCanonical = '';
    let matchedLength = 0;

    for (let size = Math.min(maxAliasWords, words.length - idx); size >= 1; size -= 1) {
      const phrase = words.slice(idx, idx + size).join(' ');
      const canonical = phraseMap.get(phrase);
      if (canonical) {
        matchedCanonical = canonical;
        matchedLength = size;
        break;
      }
    }

    if (!matchedCanonical || !matchedLength) {
      idx += 1;
      continue;
    }

    const lookback = words.slice(Math.max(0, idx - 4), idx);
    const hasHet = lookback.includes('het');
    const hasSuper = lookback.includes('super');
    const qualifier = lookback.find((word) => POSSIBLE_HET_WORDS.has(word)) || '';
    const percent = lookback.find((word) => /^\d{1,3}%$/.test(word)) || '';
    const qualifierLabel = qualifier ? titleCaseWords(qualifier) : '';

    const parts: string[] = [];
    if (hasSuper) parts.push('Super');
    if (hasHet && percent) parts.push(percent);
    if (hasHet && qualifierLabel) parts.push(qualifierLabel);
    if (hasHet) parts.push('Het');
    parts.push(matchedCanonical);

    const trait = parts.join(' ').replace(/\s+/g, ' ').trim();
    const key = trait.toLowerCase();
    if (trait && !seen.has(key)) {
      seen.add(key);
      traits.push(trait);
    }

    idx += matchedLength;
  }

  return traits;
}

export function getAllGenes(): BallPythonGeneRecord[] {
  return DB.genes.slice();
}

export function getGeneByName(geneName: string): BallPythonGeneRecord | null {
  const key = String(geneName || '').trim().toLowerCase();
  if (!key) return null;
  return byName.get(key) || null;
}

export function getGenesByType(geneType: GeneType): BallPythonGeneRecord[] {
  return (byType.get(geneType) || []).slice();
}

export function getGenesByComplex(complexName: string): BallPythonGeneRecord[] {
  const key = String(complexName || '').trim().toLowerCase();
  if (!key) return [];
  return (byComplex.get(key) || []).slice();
}

export function getGroup(groupName: keyof BallPythonGeneGroups): string[] {
  const group = DB.groups[groupName];
  return Array.isArray(group) ? group.slice() : [];
}

export function getSuperFormForGene(geneName: string): string | null {
  const gene = getGeneByName(geneName);
  if (!gene || !gene.hasSuperForm || !gene.superGeneName) return null;
  return gene.superGeneName;
}

export function getBaseGeneForSuper(superGeneName: string): BallPythonGeneRecord | null {
  const key = String(superGeneName || '').trim().toLowerCase();
  if (!key) return null;
  return superNameToBase.get(key) || null;
}

export function buildAliasRecognitionSeed(): string[] {
  const names = new Set<string>();
  DB.genes.forEach((gene) => {
    if (gene.geneName) names.add(gene.geneName);
    if (gene.superGeneName) names.add(gene.superGeneName);
    (gene.aliases || []).forEach(alias => names.add(alias));
    (gene.shorthand || []).forEach(short => names.add(short));
  });
  return [...names];
}
