import { describe, expect, it } from "vitest";
import { punnettCross } from "./punnett";
import type { Animal, Outcome } from "../types/pairing";

/**
 * Punnett cross coverage.
 *
 * This file previously contained `export default {}` and nothing else — a stub
 * named `.test.ts`, which is worse than no file at all because it reads as
 * coverage in a directory listing. The genetics engine is what this whole
 * product computes, and confirmed laboratory results are fed back through it to
 * rewrite an animal's recorded genetics, so a mistake here is a mistake in the
 * customer's breeding records.
 */

const animal = (overrides: Partial<Animal> = {}): Animal => ({
  id: "a",
  sex: "M",
  morphs: [],
  hets: [],
  ...overrides,
});

/** Total probability across every outcome, which must always be 1. */
const totalProbability = (outcomes: Outcome[]): number =>
  outcomes.reduce((sum, outcome) => sum + outcome.prob, 0);

/** Probability that an outcome's genotype contains a gene matching `pattern`. */
const probabilityOf = (outcomes: Outcome[], pattern: RegExp): number =>
  outcomes
    .filter((outcome) => outcome.genotype.some((gene) => pattern.test(gene)))
    .reduce((sum, outcome) => sum + outcome.prob, 0);

describe("punnettCross", () => {
  it("returns a single certain outcome when neither parent carries anything", () => {
    const outcomes = punnettCross(animal(), animal({ id: "b", sex: "F" }));

    expect(outcomes).toEqual([{ genotype: [], prob: 1, flags: [] }]);
  });

  it("always produces probabilities summing to 1", () => {
    const outcomes = punnettCross(
      animal({ morphs: [{ name: "Pastel", type: "co-dom" }], hets: ["Albino"] }),
      animal({ id: "b", sex: "F", morphs: [{ name: "Albino", type: "recessive" }] })
    );

    expect(totalProbability(outcomes)).toBeCloseTo(1, 6);
  });

  describe("recessive inheritance", () => {
    it("gives het x het a 25% visual and 50% het split", () => {
      const outcomes = punnettCross(
        animal({ hets: ["Albino"] }),
        animal({ id: "b", sex: "F", hets: ["Albino"] })
      );

      // The classic 1:2:1 — one visual, two carriers, one clean.
      expect(probabilityOf(outcomes, /^Albino$/)).toBeCloseTo(0.25, 5);
      expect(probabilityOf(outcomes, /het.*Albino/i)).toBeCloseTo(0.5, 5);
      expect(totalProbability(outcomes)).toBeCloseTo(1, 6);
    });

    it("gives visual x clean all carriers and no visuals", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Albino", type: "recessive" }] }),
        animal({ id: "b", sex: "F" })
      );

      expect(probabilityOf(outcomes, /^Albino$/)).toBeCloseTo(0, 5);
      expect(probabilityOf(outcomes, /het.*Albino/i)).toBeCloseTo(1, 5);
    });

    it("gives visual x het a 50/50 visual-to-carrier split", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Albino", type: "recessive" }] }),
        animal({ id: "b", sex: "F", hets: ["Albino"] })
      );

      expect(probabilityOf(outcomes, /^Albino$/)).toBeCloseTo(0.5, 5);
      expect(probabilityOf(outcomes, /het.*Albino/i)).toBeCloseTo(0.5, 5);
    });

    it("gives visual x visual all visuals", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Albino", type: "recessive" }] }),
        animal({ id: "b", sex: "F", morphs: [{ name: "Albino", type: "recessive" }] })
      );

      expect(probabilityOf(outcomes, /^Albino$/)).toBeCloseTo(1, 5);
    });
  });

  describe("co-dominant inheritance", () => {
    it("gives single-gene x clean a 50/50 split", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Pastel", type: "co-dom" }] }),
        animal({ id: "b", sex: "F" })
      );

      expect(probabilityOf(outcomes, /Pastel/)).toBeCloseTo(0.5, 5);
      expect(totalProbability(outcomes)).toBeCloseTo(1, 6);
    });

    it("produces a super form from two single-gene parents", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Pastel", type: "co-dom" }] }),
        animal({ id: "b", sex: "F", morphs: [{ name: "Pastel", type: "co-dom" }] })
      );

      // 1:2:1 again, but the homozygote is a visually distinct "super" form
      // rather than a hidden carrier — which is what makes co-dominant genes
      // worth pairing in the first place.
      expect(probabilityOf(outcomes, /Super/i)).toBeCloseTo(0.25, 5);
      expect(totalProbability(outcomes)).toBeCloseTo(1, 6);
    });
  });

  describe("independent genes", () => {
    it("multiplies probabilities across two unrelated genes", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Pastel", type: "co-dom" }], hets: ["Albino"] }),
        animal({ id: "b", sex: "F", hets: ["Albino"] })
      );

      // Pastel at 1/2 and visual Albino at 1/4 are independent, so the combined
      // outcome is 1/8. Getting this wrong understates or overstates every
      // multi-gene pairing the advisor recommends.
      const both = outcomes
        .filter(
          (outcome) =>
            outcome.genotype.some((gene) => /Pastel/.test(gene)) &&
            outcome.genotype.some((gene) => /^Albino$/.test(gene))
        )
        .reduce((sum, outcome) => sum + outcome.prob, 0);

      expect(both).toBeCloseTo(0.125, 5);
      expect(totalProbability(outcomes)).toBeCloseTo(1, 6);
    });
  });

  describe("possible hets", () => {
    it("carries a parent's uncertainty into the offspring odds", () => {
      const certain = punnettCross(
        animal({ hets: ["Albino"] }),
        animal({ id: "b", sex: "F", hets: ["Albino"] })
      );
      const uncertain = punnettCross(
        animal({ hets: ["Albino"] }),
        animal({ id: "b", sex: "F", possibleHets: ["Albino"] })
      );

      // A parent that only might carry the gene cannot produce as many visuals
      // as one that certainly does. This is exactly the uncertainty a lab test
      // is bought to remove.
      expect(probabilityOf(uncertain, /^Albino$/)).toBeLessThan(
        probabilityOf(certain, /^Albino$/)
      );
      expect(totalProbability(uncertain)).toBeCloseTo(1, 6);
    });
  });

  describe("input handling", () => {
    it("treats gene names case- and spacing-insensitively", () => {
      const spaced = punnettCross(
        animal({ hets: ["  albino  "] }),
        animal({ id: "b", sex: "F", hets: ["ALBINO"] })
      );

      // Free-text entry means the same gene arrives spelled several ways; if
      // these were treated as different genes the odds would silently halve.
      expect(probabilityOf(spaced, /^Albino$/i)).toBeCloseTo(0.25, 5);
    });

    it("does not double-count a gene listed as both visual and het", () => {
      const outcomes = punnettCross(
        animal({ morphs: [{ name: "Albino", type: "recessive" }], hets: ["Albino"] }),
        animal({ id: "b", sex: "F" })
      );

      expect(totalProbability(outcomes)).toBeCloseTo(1, 6);
      expect(probabilityOf(outcomes, /het.*Albino/i)).toBeCloseTo(1, 5);
    });
  });
});
