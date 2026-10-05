/**
 * Gene tokens and genetic claims, in the hobby's own words.
 *
 * A gene filter is a token: "Clown" is a visual Clown, "het Clown" a proven
 * het, "pos het Clown" either kind of het. The backend reads the same tokens
 * with the same rules (breeding-app-backend/src/services/marketplaceGenetics.ts),
 * so what a chip says is what the search does.
 *
 * A listing's genetics arrive as claims, each with its own provenance --
 * observed, predicted or lab-confirmed -- and they are rendered one by one,
 * never summed into a single badge.
 */

const POSSIBLE = /^(?:pos(?:s(?:ible)?)?\.?\s+het|ph)\s+/i;
const PERCENT_HET = /^(\d{1,3})\s*%\s*het\s+/i;
const HET = /^het\s+/i;
const VISUAL = /^(?:visual|vis\.?)\s+/i;

const titleCase = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

/**
 * Reads one typed token. Returns `{ gene, zygosity }` or null.
 * "het clown" -> { gene: "Clown", zygosity: "het" }
 */
export const parseGeneToken = (value) => {
  let text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  let zygosity = "visual";
  const percent = text.match(PERCENT_HET);
  if (percent) {
    zygosity = Number(percent[1]) >= 100 ? "het" : "possible_het";
    text = text.slice(percent[0].length);
  } else if (POSSIBLE.test(text)) {
    zygosity = "possible_het";
    text = text.replace(POSSIBLE, "");
  } else if (HET.test(text)) {
    zygosity = "het";
    text = text.replace(HET, "");
  } else if (VISUAL.test(text)) {
    text = text.replace(VISUAL, "");
  }
  const gene = titleCase(text);
  return gene ? { gene, zygosity } : null;
};

/** The canonical token for a gene and zygosity, as it goes in the URL. */
export const geneToken = (gene, zygosity = "visual") => {
  const name = titleCase(gene);
  if (!name) return "";
  if (zygosity === "het") return `het ${name}`;
  if (zygosity === "possible_het") return `pos het ${name}`;
  return name;
};

/** Normalises whatever was typed into its canonical token. */
export const normalizeGeneToken = (value) => {
  const parsed = parseGeneToken(value);
  return parsed ? geneToken(parsed.gene, parsed.zygosity) : "";
};

/** True when a typed search is unambiguously gene language ("het clown", "66% het pied"). */
export const isGeneLanguage = (value) => {
  const text = String(value || "").trim();
  return PERCENT_HET.test(text) || POSSIBLE.test(text) || HET.test(text) || VISUAL.test(text);
};

/** How a token reads on a chip, so "Clown" cannot be mistaken for "any Clown". */
export const tokenLabel = (token, t) => {
  const parsed = parseGeneToken(token);
  if (!parsed) return String(token || "");
  if (parsed.zygosity === "het") return t("genes.hetToken", { defaultValue: "het {{gene}}", gene: parsed.gene });
  if (parsed.zygosity === "possible_het")
    return t("genes.posHetToken", { defaultValue: "pos het {{gene}}", gene: parsed.gene });
  return t("genes.visualToken", { defaultValue: "visual {{gene}}", gene: parsed.gene });
};

export const PROVENANCE = ["observed", "predicted", "lab_confirmed"];

/**
 * Claims as the API sends them, or, for an older response without them, read
 * from the genetics line with the same zygosity rules and no lab evidence.
 */
export const claimsOf = (listing) => {
  if (Array.isArray(listing?.geneticClaims)) return listing.geneticClaims;
  return String(listing?.genetics || "")
    .split(/[,/;]|\s\+\s/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((label) => {
      const parsed = parseGeneToken(label) || { gene: label, zygosity: "visual" };
      return {
        label,
        gene: parsed.gene,
        zygosity: parsed.zygosity,
        provenance: parsed.zygosity === "visual" ? "observed" : "predicted",
        source: "seller",
        lab: null,
        labDisagrees: false,
      };
    });
};

/** One line explaining where a claim comes from, in the buyer's terms. */
export const provenanceText = (claim, t) => {
  if (claim.provenance === "lab_confirmed") {
    return claim.lab?.certificateNumber
      ? t("genes.labConfirmedCert", {
          defaultValue: "Lab-confirmed, certificate {{number}}",
          number: claim.lab.certificateNumber,
        })
      : t("genes.labConfirmed", { defaultValue: "Lab-confirmed" });
  }
  if (claim.provenance === "predicted") {
    return claim.percent && claim.percent < 100
      ? t("genes.predictedPercent", {
          defaultValue: "Predicted from the pairing, {{percent}}% odds",
          percent: claim.percent,
        })
      : t("genes.predicted", { defaultValue: "Predicted from the pairing, not tested" });
  }
  return t("genes.observed", { defaultValue: "Observed by the seller, not tested" });
};

/** Zygosity in the hobby's words. */
export const zygosityText = (claim, t) => {
  if (claim.zygosity === "het") return t("genes.het", { defaultValue: "het" });
  if (claim.zygosity === "possible_het") return t("genes.possibleHet", { defaultValue: "possible het" });
  return claim.homozygous
    ? t("genes.super", { defaultValue: "visual (super)" })
    : t("genes.visual", { defaultValue: "visual" });
};
