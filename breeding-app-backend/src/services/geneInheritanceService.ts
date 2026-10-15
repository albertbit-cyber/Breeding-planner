/**
 * Which kind of gene a laboratory test reads, and therefore which answers the
 * laboratory may record for it.
 *
 * A recessive gene is negative, het or homozygous. An incomplete dominant gene
 * is negative, single or super. A dominant gene is present or not present. The
 * old result form offered the same three words for every test, which let a
 * dominant gene be called "heterozygous" and never let a super form be recorded
 * at all. The inheritance type decides the vocabulary, so it has to be known
 * here, where the result is validated and written onto the animal.
 *
 * Sources, in order: a gene the laboratory itself submitted through the gene
 * submission flow (its own, or any approved one), then the generated species
 * gene tables (geneIndex.json, written by scripts/species/buildSpeciesDatabase.mjs
 * alongside the breeder's tables). A test whose gene is in neither is `unknown`,
 * and the result form falls back to the recessive vocabulary and says so rather
 * than guessing.
 */
import geneIndexDocument from "../config/geneIndex.json";
import { prisma } from "../lib/prisma";

export type InheritanceKind = "recessive" | "incomplete_dominant" | "dominant" | "sex" | "unknown";

export type TestInheritance = {
  kind: InheritanceKind;
  /** The gene as the species table spells it; the ordered name when unknown. */
  gene: string;
  /** Trade name of the super form when the table knows one ("Black-Eyed Leucistic"). */
  superGeneName: string | null;
  speciesId: string | null;
};

type GeneRow = {
  geneName: string;
  geneType: string;
  hasSuperForm?: boolean;
  superGeneName?: string | null;
  aliases?: string[];
  shorthand?: string[];
};

type OfferingLike =
  | {
      name?: string | null;
      geneTarget?: string | null;
      testKind?: string | null;
      speciesIds?: string[] | null;
      aliases?: string[] | null;
    }
  | null
  | undefined;

export type TestLike = {
  testNameSnapshot?: string | null;
  /** `morph` or `sex`, snapshotted at order time; the only kind signal an order from the legacy catalogue has. */
  pricingTypeSnapshot?: string | null;
  offering?: OfferingLike;
};

const GENE_TYPES = new Set(["recessive", "incomplete_dominant", "dominant"]);

export const normalizeGeneLookupKey = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

type SpeciesLookup = Map<string, GeneRow>;

const buildSpeciesLookup = (rows: GeneRow[]): SpeciesLookup => {
  const lookup: SpeciesLookup = new Map();
  rows.forEach((row) => {
    const names = [row.geneName, ...(row.aliases || []), ...(row.shorthand || [])];
    names.forEach((name) => {
      const key = normalizeGeneLookupKey(name);
      // First writer wins: a gene's own name beats another gene's shorthand.
      if (key && !lookup.has(key)) lookup.set(key, row);
    });
  });
  return lookup;
};

const STATIC_LOOKUPS: Map<string, SpeciesLookup> = new Map(
  Object.entries((geneIndexDocument as { species: Record<string, GeneRow[]> }).species || {}).map(
    ([speciesId, rows]) => [speciesId, buildSpeciesLookup(Array.isArray(rows) ? rows : [])]
  )
);

/**
 * Genes laboratories have submitted, per species. Approved ones count for
 * everyone; a lab's own pending submission counts for that lab, so it is never
 * blocked on review for a test it already sells.
 */
const loadSubmittedLookups = async (
  speciesIds: string[],
  organizationId?: string | null
): Promise<Map<string, SpeciesLookup>> => {
  const result = new Map<string, SpeciesLookup>();
  if (!speciesIds.length) return result;

  let rows: any[] = [];
  try {
    rows = await prisma.labGeneSubmission.findMany({
      where: {
        speciesId: { in: speciesIds },
        OR: organizationId
          ? [{ status: "approved" }, { status: "pending", organizationId }]
          : [{ status: "approved" }],
      },
      select: {
        speciesId: true,
        geneName: true,
        geneType: true,
        hasSuperForm: true,
        superGeneName: true,
        aliases: true,
      },
    });
  } catch {
    // The static tables still answer. A lab's own additions are a bonus, not a
    // precondition for entering a result.
    rows = [];
  }

  const bySpecies = new Map<string, GeneRow[]>();
  rows.forEach((row) => {
    const list = bySpecies.get(row.speciesId) || [];
    list.push({
      geneName: row.geneName,
      geneType: row.geneType,
      hasSuperForm: Boolean(row.hasSuperForm),
      superGeneName: row.superGeneName || null,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      shorthand: [],
    });
    bySpecies.set(row.speciesId, list);
  });
  bySpecies.forEach((list, speciesId) => result.set(speciesId, buildSpeciesLookup(list)));
  return result;
};

const findGene = (
  lookups: Array<[string, SpeciesLookup]>,
  candidates: string[]
): { row: GeneRow; speciesId: string } | null => {
  for (const candidate of candidates) {
    const key = normalizeGeneLookupKey(candidate);
    if (!key) continue;
    for (const [speciesId, lookup] of lookups) {
      const row = lookup.get(key);
      if (row) return { row, speciesId };
    }
  }
  return null;
};

export type InheritanceResolver = (test: TestLike) => TestInheritance;

/**
 * Build a resolver for one order's tests: one database read for the whole
 * order, however many tests it carries.
 */
export const createInheritanceResolver = async (
  tests: TestLike[],
  organizationId?: string | null
): Promise<InheritanceResolver> => {
  const speciesIds = Array.from(
    new Set(
      tests
        .flatMap((test) => (Array.isArray(test?.offering?.speciesIds) ? test.offering.speciesIds : []))
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const submitted = await loadSubmittedLookups(speciesIds, organizationId);

  return (test) => {
    const offering = test?.offering || null;
    const orderedName = String(test?.testNameSnapshot || offering?.name || "").trim();
    const geneTarget = String(offering?.geneTarget || "").trim();
    const displayGene = geneTarget || orderedName;

    const isSexTest =
      String(offering?.testKind || "").trim() === "sex"
      || String(test?.pricingTypeSnapshot || "").trim() === "sex";
    if (isSexTest) {
      return { kind: "sex", gene: displayGene, superGeneName: null, speciesId: null };
    }

    const offeringSpecies = Array.isArray(offering?.speciesIds)
      ? offering.speciesIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    // The lab's own submissions first (they may correct a table entry), then the
    // tables for the offering's species, then every table when the offering has
    // not said which species it serves.
    const lookups: Array<[string, SpeciesLookup]> = [];
    offeringSpecies.forEach((id) => {
      const lookup = submitted.get(id);
      if (lookup) lookups.push([id, lookup]);
    });
    offeringSpecies.forEach((id) => {
      const lookup = STATIC_LOOKUPS.get(id);
      if (lookup) lookups.push([id, lookup]);
    });
    if (!offeringSpecies.length) {
      submitted.forEach((lookup, id) => lookups.push([id, lookup]));
      STATIC_LOOKUPS.forEach((lookup, id) => lookups.push([id, lookup]));
    }

    const candidates = [
      geneTarget,
      orderedName,
      String(offering?.name || ""),
      ...(Array.isArray(offering?.aliases) ? offering.aliases : []),
    ].filter(Boolean);

    const found = findGene(lookups, candidates);
    if (!found || !GENE_TYPES.has(found.row.geneType)) {
      return { kind: "unknown", gene: displayGene, superGeneName: null, speciesId: null };
    }

    return {
      kind: found.row.geneType as InheritanceKind,
      gene: found.row.geneName,
      superGeneName: found.row.hasSuperForm ? found.row.superGeneName || null : null,
      speciesId: found.speciesId,
    };
  };
};

type OrderWithTests = { labOrganizationId?: string | null; animals?: any[] };

/**
 * Put `inheritance` on every ordered test of an order, in place of the raw
 * offering relation the query loaded. The order keeps the shape the clients
 * already read.
 */
export const attachTestInheritance = async <T extends OrderWithTests>(order: T): Promise<T> => {
  if (!order || !Array.isArray(order.animals)) return order;
  const tests: TestLike[] = order.animals.flatMap((animal: any) =>
    Array.isArray(animal?.tests) ? animal.tests : []
  );
  if (!tests.length) return order;
  const resolve = await createInheritanceResolver(tests, order.labOrganizationId);
  return {
    ...order,
    animals: order.animals.map((animal: any) => ({
      ...animal,
      tests: (Array.isArray(animal?.tests) ? animal.tests : []).map((test: any) => {
        const { offering: _offering, ...rest } = test;
        return { ...rest, inheritance: resolve(test) };
      }),
    })),
  };
};

export const attachTestInheritanceToAll = async <T extends OrderWithTests>(orders: T[]): Promise<T[]> =>
  Promise.all(orders.map((order) => attachTestInheritance(order)));
