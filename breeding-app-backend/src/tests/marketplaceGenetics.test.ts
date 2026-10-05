import { describe, expect, it } from "vitest";
import {
  claimHasGene,
  geneticsMatchToken,
  labCallOf,
  parseGeneticClaims,
  withLabResults,
} from "../services/marketplaceGenetics";

const shape = (genetics: string) =>
  parseGeneticClaims(genetics).map(({ gene, zygosity, percent, homozygous, provenance }) => ({
    gene,
    zygosity,
    percent,
    homozygous,
    provenance,
  }));

describe("parseGeneticClaims", () => {
  it("reads the way listings are actually written, commas or not", () => {
    expect(shape("Clown het Pied 66% het Hypo")).toEqual([
      { gene: "Clown", zygosity: "visual", percent: null, homozygous: false, provenance: "observed" },
      { gene: "Pied", zygosity: "het", percent: null, homozygous: false, provenance: "predicted" },
      { gene: "Hypo", zygosity: "possible_het", percent: 66, homozygous: false, provenance: "predicted" },
    ]);
  });

  it("knows the hobby's shorthand for possible hets and supers", () => {
    expect(shape("Super Pastel, ph Albino, pos het Ghost, 100% het Clown, 50 % het Pied")).toEqual([
      { gene: "Pastel", zygosity: "visual", percent: null, homozygous: true, provenance: "observed" },
      { gene: "Albino", zygosity: "possible_het", percent: null, homozygous: false, provenance: "predicted" },
      { gene: "Ghost", zygosity: "possible_het", percent: null, homozygous: false, provenance: "predicted" },
      { gene: "Clown", zygosity: "het", percent: 100, homozygous: false, provenance: "predicted" },
      { gene: "Pied", zygosity: "possible_het", percent: 50, homozygous: false, provenance: "predicted" },
    ]);
  });

  it("keeps the seller's wording as the label", () => {
    expect(parseGeneticClaims("66% het Hypo")[0].label).toBe("66% het Hypo");
  });

  it("returns nothing for an empty line", () => {
    expect(parseGeneticClaims("")).toEqual([]);
    expect(parseGeneticClaims(null)).toEqual([]);
    expect(parseGeneticClaims("het")).toEqual([]);
  });
});

describe("gene filters", () => {
  it("finds a gene inside a visual written as one phrase", () => {
    expect(claimHasGene("Pastel Clown", "Clown")).toBe(true);
    expect(claimHasGene("Pastel Clown", "Pastel")).toBe(true);
  });

  it("never finds a gene inside a different multi-word gene", () => {
    expect(claimHasGene("Lavender Albino", "Albino")).toBe(false);
    expect(claimHasGene("Lavender Albino", "Lavender Albino")).toBe(true);
    expect(claimHasGene("Pastel Lavender Albino", "Pastel")).toBe(true);
    expect(claimHasGene("Black Pastel", "Pastel")).toBe(false);
  });

  it("treats a bare gene as a visual, and 'het' as a het", () => {
    expect(geneticsMatchToken("Clown", "Clown")).toBe(true);
    expect(geneticsMatchToken("het Clown", "Clown")).toBe(false);
    expect(geneticsMatchToken("het Clown", "het Clown")).toBe(true);
    expect(geneticsMatchToken("66% het Clown", "het Clown")).toBe(false);
  });

  it("lets 'pos het' take either kind of het", () => {
    expect(geneticsMatchToken("66% het Clown", "pos het Clown")).toBe(true);
    expect(geneticsMatchToken("het Clown", "pos het Clown")).toBe(true);
    expect(geneticsMatchToken("Clown", "pos het Clown")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(geneticsMatchToken("PASTEL CLOWN", "clown")).toBe(true);
  });
});

describe("withLabResults", () => {
  const lines = [
    { test: "Clown", result: "Het Clown" },
    { test: "Hypo", result: "Negative" },
    { test: "Pied", result: "Pied" },
  ];

  it("confirms what the lab supports, and disputes what it contradicts, claim by claim", () => {
    const claims = withLabResults(parseGeneticClaims("66% het Clown, het Hypo"), lines, "C-1");
    const byGene = Object.fromEntries(claims.map((claim) => [claim.gene, claim]));

    expect(byGene.Clown).toMatchObject({
      zygosity: "possible_het",
      provenance: "lab_confirmed",
      labDisagrees: false,
      lab: { call: "het", certificateNumber: "C-1" },
    });
    // The seller's het Hypo stays a prediction, now marked as contradicted.
    expect(byGene.Hypo).toMatchObject({ provenance: "predicted", labDisagrees: true, lab: { call: "negative" } });
    // A gene the lab found that the seller never mentioned.
    expect(byGene.Pied).toMatchObject({ source: "lab", zygosity: "visual", provenance: "lab_confirmed" });
  });

  it("leaves claims untouched without a certificate", () => {
    const claims = parseGeneticClaims("Clown");
    expect(withLabResults(claims, undefined)).toBe(claims);
  });

  it("reads the certificate's wording as a call", () => {
    expect(labCallOf({ test: "Clown", result: "Clown" })).toBe("visual");
    expect(labCallOf({ test: "Clown", result: "Het Clown" })).toBe("het");
    expect(labCallOf({ test: "Clown", result: "Negative" })).toBe("negative");
    expect(labCallOf({ test: "Clown", result: "Inconclusive" })).toBe("inconclusive");
  });
});
