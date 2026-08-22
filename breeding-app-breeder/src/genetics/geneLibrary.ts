import { MorphType } from "../types/pairing";
import {
  getActiveSpeciesId,
  getAllGenes,
  getDefaultGeneAliasRows,
  getGeneDatabaseGeneration,
} from "./geneDatabase";
import { DEFAULT_SPECIES_ID } from "./speciesRegistry";

/**
 * Display-group label for each inheritance type in the gene database. Keys match the
 * labels the UI already renders, so widening the database's GeneType union does not
 * require touching call sites.
 */
const GENE_TYPE_GROUP_LABELS: Record<string, string> = {
  recessive: 'Recessive',
  incomplete_dominant: 'Incomplete Dominant',
  dominant: 'Dominant',
  polygenic: 'Polygenic',
  locality: 'Locality',
  physical: 'Physical',
  other: 'Other',
};

/**
 * Names kept in the picker that are not database entries, per species. Ball python's
 * 'Axanthic' is a deliberate catch-all: no gene claims it, but keepers routinely record an
 * axanthic animal without knowing which of the five lines it carries. Dropping it would
 * stop that token resolving, so it stays until the line is identified.
 *
 * Scoped per species on purpose -- a catch-all only makes sense where the species actually
 * has lines to be uncertain between, and inventing one elsewhere would offer keepers a gene
 * their animals cannot carry.
 */
const UNRESOLVED_CATCH_ALL_GENES: Record<string, Record<string, string>> = {
  [DEFAULT_SPECIES_ID]: { Axanthic: 'Recessive' },
};

/**
 * Derived from the gene database rather than hand-maintained. The previous hardcoded
 * list had drifted five genes behind it -- Arid, Dark Angel, High Orange Gene, Kosmos
 * and Typhoon existed in the database but were unreachable from autocomplete and gene
 * name matching, because both read this list rather than the database.
 */
function buildGeneGroups(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const catchAlls = UNRESOLVED_CATCH_ALL_GENES[getActiveSpeciesId()] || {};
  Object.values(GENE_TYPE_GROUP_LABELS).forEach((label) => {
    groups[label] = [];
  });

  getAllGenes().forEach((gene) => {
    const label = GENE_TYPE_GROUP_LABELS[gene.geneType];
    if (!label) return;
    groups[label].push(gene.geneName);
  });

  Object.entries(catchAlls).forEach(([name, label]) => {
    if (!groups[label] || groups[label].includes(name)) return;
    groups[label].push(name);
  });

  Object.keys(groups).forEach((label) => {
    if (groups[label].length) groups[label].sort((a, b) => a.localeCompare(b));
    else delete groups[label];
  });

  return groups;
}

/**
 * Everything derived from the gene database, rebuilt when the active species changes.
 * These used to be module-level consts evaluated once at import; with more than one species
 * that would pin the whole app to whichever species happened to be active at load time.
 */
type DerivedGeneTables = {
  groups: Record<string, string[]>;
  aliases: Record<string, string>;
  groupLookup: Map<string, string>;
};

let derivedCache: DerivedGeneTables | null = null;
let derivedGeneration = -1;

function derived(): DerivedGeneTables {
  const generation = getGeneDatabaseGeneration();
  if (derivedCache && derivedGeneration === generation) return derivedCache;

  const groups = buildGeneGroups();
  const groupLookup = new Map<string, string>();
  Object.entries(groups).forEach(([group, genes]) => {
    genes.forEach((gene) => {
      if (!gene) return;
      groupLookup.set(String(gene).trim().toLowerCase(), group);
    });
  });

  derivedCache = { groups, aliases: buildLegacyGeneAliases(), groupLookup };
  derivedGeneration = generation;
  return derivedCache;
}

/** Gene names by display group for the active species. */
export function getGeneGroups(): Record<string, string[]> {
  return derived().groups;
}

/** Alias/shorthand -> canonical gene name for the active species. */
export function getGeneAliases(): Record<string, string> {
  return derived().aliases;
}

export const PRIMARY_GENE_GROUPS = ["Recessive", "Incomplete Dominant", "Dominant", "Other"] as const;

const LEGACY_FIXED_GENE_ALIASES: Record<string, string> = {
  ultramelanistic: "Ultramel",
};

function buildLegacyGeneAliases(): Record<string, string> {
  const out: Record<string, string> = { ...LEGACY_FIXED_GENE_ALIASES };
  const rows = getDefaultGeneAliasRows();
  rows.forEach((row) => {
    const canonical = String(row?.geneName || "").trim();
    if (!canonical) return;
    const variants = [
      canonical,
      ...(Array.isArray(row?.aliases) ? row.aliases : []),
      ...(Array.isArray(row?.shorthand) ? row.shorthand : []),
    ];
    variants.forEach((variant) => {
      const key = String(variant || "").trim().toLowerCase();
      if (!key || out[key]) return;
      out[key] = canonical;
    });
  });
  return out;
}

export function normalizeGeneCandidate(raw: unknown): string {
  if (!raw) return "";
  return String(raw).trim().toLowerCase();
}

export function getGeneGroupFromDatabase(rawGene: unknown): string | null {
  if (!rawGene) return null;
  const seen = new Set<string>();
  const enqueue = (value: unknown) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
    }
  };

  const original = String(rawGene).trim();
  if (!original) return null;
  enqueue(original);

  const noParens = original.replace(/\(.*?\)/g, "").trim();
  if (noParens && noParens !== original) enqueue(noParens);

  const stripSuper = noParens.replace(/^super[\s-]+/i, "").trim();
  if (stripSuper && stripSuper !== noParens) enqueue(stripSuper);

  const camelSuper = noParens.match(/^super([A-Z].*)$/);
  if (camelSuper && camelSuper[1]) enqueue(camelSuper[1]);

  const { aliases: geneAliases, groupLookup } = derived();

  const aliasExpanded = geneAliases[noParens.toLowerCase()];
  if (aliasExpanded) enqueue(aliasExpanded);

  const axanthicVariant = original.match(/^\s*axanthic\s*\(([^)]+)\)/i);
  if (axanthicVariant && axanthicVariant[1]) {
    const variantRaw = axanthicVariant[1].replace(/\s+/g, " ").trim();
    if (variantRaw) {
      const lower = variantRaw.toLowerCase();
      const variantAliases = [
        { match: /tsk/, canonical: "TSK" },
        { match: /gcr/, canonical: "GCR" },
        { match: /jol(l|liff)/, canonical: "Jolliff" },
        { match: /mj/, canonical: "MJ" },
        { match: /vpi/, canonical: "VPI" },
      ];
      let canonicalVariant: string | null = null;
      for (const { match, canonical } of variantAliases) {
        if (match.test(lower)) {
          canonicalVariant = canonical;
          break;
        }
      }
      if (!canonicalVariant) {
        canonicalVariant = variantRaw.replace(/\s*line$/i, "").trim();
      }
      if (canonicalVariant) {
        enqueue(`Axanthic (${canonicalVariant})`);
      }
      enqueue("Axanthic");
    }
  }

  const stripLeadingHet = stripSuper.replace(/^(?:\d{1,3}%\s+)?(?:pos(?:s?i?a?ble)?\s+)?het\s+/i, "").trim();
  if (stripLeadingHet && stripLeadingHet !== stripSuper) enqueue(stripLeadingHet);

  const stripPercent = stripLeadingHet.replace(/^(?:\d{1,3}%\s*)/i, "").trim();
  if (stripPercent && stripPercent !== stripLeadingHet) enqueue(stripPercent);

  for (const candidate of seen) {
    const alias = geneAliases[candidate];
    if (alias) enqueue(alias);
  }

  for (const candidate of seen) {
    const key = normalizeGeneCandidate(candidate);
    if (groupLookup.has(key)) {
      return groupLookup.get(key) || null;
    }
  }
  return null;
}

export function normalizePrimaryGeneGroup(group: string | null | undefined): string {
  if (!group) return "Other";
  if (group === "Polygenic" || group === "Locality") return "Other";
  if (!PRIMARY_GENE_GROUPS.includes(group as typeof PRIMARY_GENE_GROUPS[number])) return "Other";
  return group;
}

export function getGeneDisplayGroup(rawGene: string | null | undefined): string {
  const group = getGeneGroupFromDatabase(rawGene);
  return normalizePrimaryGeneGroup(group);
}

export function inferMorphType(rawGene: string | null | undefined): MorphType {
  const group = getGeneDisplayGroup(rawGene);
  if (group === "Recessive") return "recessive";
  if (group === "Incomplete Dominant") return "co-dom";
  if (group === "Dominant") return "dominant";
  return "polygenic";
}
