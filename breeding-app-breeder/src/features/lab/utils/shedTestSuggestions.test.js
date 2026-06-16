import { describe, expect, it } from "vitest";
import {
  extractSuggestedHetGenes,
  getSuggestedHetTestIds,
  matchSuggestedHetTests,
} from "./shedTestSuggestions";

const catalog = [
  { id: "morph-clown", name: "Clown", pricingType: "morph" },
  { id: "morph-pied", name: "Pied", pricingType: "morph" },
  {
    id: "morph-desert_ghost",
    name: "Desert Ghost",
    geneTarget: "Desert Ghost",
    pricingType: "morph",
  },
  { id: "morph-hypo", name: "Hypo", pricingType: "morph" },
  { id: "sex-determination", name: "Sex Determination", pricingType: "sex" },
];

describe("shed test suggestions", () => {
  it("suggests matching tests for 66%, 50%, and possible het genetics", () => {
    const snake = {
      hets: ["66% het Clown", "50% Pied"],
      possibleHets: ["Desert Ghost"],
      genetics: "Pastel, possible het Hypo",
    };

    expect(extractSuggestedHetGenes(snake).map((entry) => entry.gene)).toEqual([
      "Clown",
      "Pied",
      "Desert Ghost",
      "Hypo",
    ]);
    expect(getSuggestedHetTestIds(snake, catalog)).toEqual([
      "morph-clown",
      "morph-pied",
      "morph-desert_ghost",
      "morph-hypo",
    ]);
  });

  it("does not suggest proven het or visual genetics", () => {
    const snake = {
      morphs: ["Pied"],
      hets: ["Clown"],
      possibleHets: [],
      genetics: "Pastel het Lavender Albino",
    };

    expect(extractSuggestedHetGenes(snake)).toEqual([]);
    expect(getSuggestedHetTestIds(snake, catalog)).toEqual([]);
  });

  it("keeps unmatched suggestions visible without selecting unavailable tests", () => {
    const snake = {
      hets: ["66% het Ultramel"],
      possibleHets: ["Monsoon"],
    };

    expect(matchSuggestedHetTests(snake, catalog)).toEqual([
      expect.objectContaining({
        gene: "Ultramel",
        matched: false,
        testId: null,
      }),
      expect.objectContaining({
        gene: "Monsoon",
        matched: false,
        testId: null,
      }),
    ]);
    expect(getSuggestedHetTestIds(snake, catalog)).toEqual([]);
  });
});
