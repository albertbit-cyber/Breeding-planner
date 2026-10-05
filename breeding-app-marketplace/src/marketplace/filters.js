import { geneTokens, joinTokens } from "./format";
import { geneToken, normalizeGeneToken, parseGeneToken, tokenLabel } from "./genetics";

/**
 * The browse filter model.
 *
 * Filters live in the URL, which is what makes a search shareable, bookmarkable
 * and survivable across a back button -- none of which was possible when the
 * whole marketplace was one page holding filters in component state.
 */

export const DEFAULT_FILTERS = {
  search: "",
  species: "",
  sex: "",
  category: "",
  country: "",
  includeGenes: "",
  excludeGenes: "",
  minPrice: "",
  maxPrice: "",
  minWeight: "",
  maxWeight: "",
  minProvenance: "",
  shippingAvailable: "",
  pickupAvailable: "",
  verifiedOnly: "",
  availability: "",
  includeSold: "",
  sort: "best",
  page: "",
};

export const CATEGORIES = ["Hatchling", "Juvenile", "Sub-adult", "Adult", "Proven breeder", "Holdback"];

export const SORTS = ["best", "newest", "price_low", "price_high", "updated"];

export const fromSearchParams = (params) => {
  const filters = { ...DEFAULT_FILTERS };
  Object.keys(DEFAULT_FILTERS).forEach((key) => {
    const value = params.get(key);
    if (value !== null) filters[key] = value;
  });
  if (!SORTS.includes(filters.sort)) filters.sort = "best";
  return filters;
};

export const toSearchParams = (filters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (key === "sort" && value === "best") return;
    if (key === "page" && String(value) === "1") return;
    params.set(key, String(value));
  });
  return params;
};

/**
 * Gene tokens are a set, not a text field, and they speak the hobby's
 * language: a bare gene is a visual, "het Clown" is a het. A quick gene cycles
 * visual -> het -> ruled out -> off, which replaced two comma-separated
 * free-text boxes labelled "Include genes" and "Exclude genes" -- and a filter
 * that could not tell a visual Clown from a het one.
 */
const sameGene = (token, gene) => parseGeneToken(token)?.gene.toLowerCase() === gene.toLowerCase();

export const geneState = (filters, gene) => {
  const included = geneTokens(filters.includeGenes).find((token) => sameGene(token, gene));
  if (included) return parseGeneToken(included)?.zygosity === "visual" ? "visual" : "het";
  if (geneTokens(filters.excludeGenes).some((token) => sameGene(token, gene))) return "exclude";
  return "off";
};

export const cycleGene = (filters, gene) => {
  const state = geneState(filters, gene);
  const includes = geneTokens(filters.includeGenes).filter((token) => !sameGene(token, gene));
  const excludes = geneTokens(filters.excludeGenes).filter((token) => !sameGene(token, gene));

  if (state === "off") {
    return { includeGenes: joinTokens([...includes, geneToken(gene, "visual")]), excludeGenes: joinTokens(excludes) };
  }
  if (state === "visual") {
    return { includeGenes: joinTokens([...includes, geneToken(gene, "het")]), excludeGenes: joinTokens(excludes) };
  }
  if (state === "het") {
    return { includeGenes: joinTokens(includes), excludeGenes: joinTokens([...excludes, geneToken(gene, "visual")]) };
  }
  return { includeGenes: joinTokens(includes), excludeGenes: joinTokens(excludes) };
};

/** Adds a typed token ("het clown", "Pastel") to the required genes, once. */
export const addGeneToken = (filters, value) => {
  const token = normalizeGeneToken(value);
  if (!token) return {};
  const parsed = parseGeneToken(token);
  const includes = geneTokens(filters.includeGenes).filter((existing) => !sameGene(existing, parsed.gene));
  const excludes = geneTokens(filters.excludeGenes).filter((existing) => !sameGene(existing, parsed.gene));
  return { includeGenes: joinTokens([...includes, token]), excludeGenes: joinTokens(excludes) };
};

/** Everything currently narrowing the results, as removable chips. */
export const activeChips = (filters, t) => {
  const chips = [];
  const push = (key, label, patch) => chips.push({ key, label, patch });

  geneTokens(filters.includeGenes).forEach((gene) =>
    push(`gene-in-${gene}`, tokenLabel(gene, t), {
      includeGenes: joinTokens(geneTokens(filters.includeGenes).filter((token) => token !== gene)),
    })
  );
  geneTokens(filters.excludeGenes).forEach((gene) =>
    push(`gene-out-${gene}`, t("filters.without", { defaultValue: "no {{gene}}", gene: tokenLabel(gene, t) }), {
      excludeGenes: joinTokens(geneTokens(filters.excludeGenes).filter((token) => token !== gene)),
    })
  );

  if (filters.sex) push("sex", t(`sex.${filters.sex}`, { defaultValue: filters.sex }), { sex: "" });
  if (filters.category) push("category", filters.category, { category: "" });
  if (filters.country) push("country", filters.country, { country: "" });
  if (filters.minPrice) push("minPrice", t("filters.from", { defaultValue: "from {{value}}", value: filters.minPrice }), { minPrice: "" });
  if (filters.maxPrice) push("maxPrice", t("filters.under", { defaultValue: "under {{value}}", value: filters.maxPrice }), { maxPrice: "" });
  if (filters.minWeight) push("minWeight", `≥ ${filters.minWeight} g`, { minWeight: "" });
  if (filters.maxWeight) push("maxWeight", `≤ ${filters.maxWeight} g`, { maxWeight: "" });
  if (filters.verifiedOnly) push("verifiedOnly", t("filters.verified", { defaultValue: "Verified breeders" }), { verifiedOnly: "" });
  if (filters.shippingAvailable) push("shipping", t("filters.shipping", { defaultValue: "Ships" }), { shippingAvailable: "" });
  if (filters.pickupAvailable) push("pickup", t("filters.pickup", { defaultValue: "Local pickup" }), { pickupAvailable: "" });
  if (filters.minProvenance)
    push("minProvenance", t("filters.recordAtLeast", { defaultValue: "record ≥ {{count}}/4", count: filters.minProvenance }), {
      minProvenance: "",
    });
  if (filters.includeSold) push("includeSold", t("filters.showingSold", { defaultValue: "Including sold" }), { includeSold: "" });
  if (filters.availability)
    push("availability", t(`availability.${filters.availability}`, { defaultValue: filters.availability }), { availability: "" });
  if (filters.species) push("species", filters.species, { species: "" });

  return chips;
};

export const countActive = (filters) => {
  const keys = [
    "sex",
    "category",
    "country",
    "minPrice",
    "maxPrice",
    "minWeight",
    "maxWeight",
    "minProvenance",
    "shippingAvailable",
    "pickupAvailable",
    "verifiedOnly",
    "availability",
    "species",
  ];
  return (
    keys.filter((key) => Boolean(filters[key])).length +
    geneTokens(filters.includeGenes).length +
    geneTokens(filters.excludeGenes).length
  );
};

/** Morphs common enough to be worth one click on the browse page. */
export const QUICK_GENES = [
  "Clown",
  "Pied",
  "Banana",
  "Pastel",
  "Axanthic",
  "Desert Ghost",
  "Lavender Albino",
  "Ultramel",
  "Enchi",
  "Leopard",
  "Yellow Belly",
  "Spider",
];
