const normalizeGeneKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const stripUncertainHetPrefix = (value) =>
  String(value || "")
    .trim()
    .replace(/^\s*(?:66|50)\s*%\s*/i, "")
    .replace(/^\s*(?:pos(?:sible)?|probable|maybe|ph)\s+/i, "")
    .replace(/^\s*het\s+/i, "")
    .replace(/\s*\((?:possible|poss\.?|66\s*%|50\s*%)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

const splitGeneticsText = (value) =>
  String(value || "")
    .split(/[\n,;/]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseUncertainHetGene = (value, forcePossible = false) => {
  const token = String(value || "").trim();
  if (!token) return null;
  const normalized = token.replace(/\s+/g, " ").toLowerCase();
  const isUncertain =
    forcePossible ||
    /(?:^|\b)(?:66|50)\s*%\s*(?:het\s*)?/i.test(token) ||
    /(?:^|\b)(?:pos(?:sible)?|probable|maybe|ph)\s+(?:het\s+)?/i.test(token) ||
    /\((?:possible|poss\.?|66\s*%|50\s*%)\)/i.test(token);

  if (!isUncertain) return null;

  const gene = stripUncertainHetPrefix(token);
  if (!gene || normalizeGeneKey(gene) === "het") return null;

  return {
    gene,
    key: normalizeGeneKey(gene),
    sourceLabel: normalized.includes("66") ? "66% het"
      : normalized.includes("50") ? "50% het"
      : "possible het",
  };
};

const uniqueSuggestions = (suggestions) => {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    if (!suggestion?.key || seen.has(suggestion.key)) return false;
    seen.add(suggestion.key);
    return true;
  });
};

export const extractSuggestedHetGenes = (snake) => {
  if (!snake || typeof snake !== "object") return [];

  const fromHets = Array.isArray(snake.hets)
    ? snake.hets.map((entry) => parseUncertainHetGene(entry)).filter(Boolean)
    : [];
  const fromPossibleHets = Array.isArray(snake.possibleHets)
    ? snake.possibleHets.map((entry) => parseUncertainHetGene(entry, true)).filter(Boolean)
    : [];
  const fromGeneticsText = splitGeneticsText(snake.genetics || snake.morph || snake.geneticsSummary)
    .map((entry) => parseUncertainHetGene(entry))
    .filter(Boolean);

  return uniqueSuggestions([...fromHets, ...fromPossibleHets, ...fromGeneticsText]);
};

const catalogKeysForTest = (test) => {
  const values = [
    test?.name,
    test?.shortLabel,
    test?.geneTarget,
    test?.id,
    String(test?.id || "").replace(/^morph[-_]/i, ""),
  ];
  return values.map(normalizeGeneKey).filter(Boolean);
};

export const matchSuggestedHetTests = (snake, catalogTests) => {
  const suggestions = extractSuggestedHetGenes(snake);
  const tests = Array.isArray(catalogTests) ? catalogTests : [];
  const testByGeneKey = new Map();

  tests.forEach((test) => {
    const pricingType = String(test?.pricingType || "").toLowerCase();
    const category = String(test?.category || "").toLowerCase();
    if (pricingType === "sex" || category === "sex-determination") return;
    catalogKeysForTest(test).forEach((key) => {
      if (!testByGeneKey.has(key)) testByGeneKey.set(key, test);
    });
  });

  return suggestions.map((suggestion) => {
    const test = testByGeneKey.get(suggestion.key);
    return {
      ...suggestion,
      testId: test?.id ? String(test.id) : null,
      testName: test?.name ? String(test.name) : suggestion.gene,
      matched: Boolean(test?.id),
    };
  });
};

export const getSuggestedHetTestIds = (snake, catalogTests) =>
  matchSuggestedHetTests(snake, catalogTests)
    .filter((suggestion) => suggestion.matched && suggestion.testId)
    .map((suggestion) => suggestion.testId);
