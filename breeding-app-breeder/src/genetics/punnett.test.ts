import { describe, expect, it } from "vitest";
import { cross } from "./index";
import { inferMorphType } from "./geneLibrary";
import { Animal } from "../types/pairing";

const makeAnimal = (overrides: Partial<Animal>): Animal => ({
  id: overrides.id ?? "generated",
  sex: overrides.sex ?? "F",
  morphs: overrides.morphs ?? [],
  hets: overrides.hets ?? [],
  possibleHets: overrides.possibleHets,
});

const findProb = (outcomes: ReturnType<typeof cross>, labels: string[]): number => {
  const target = labels.slice().sort().join("|");
  const entry = outcomes.find((outcome) => outcome.genotype.slice().sort().join("|") === target);
  return entry?.prob ?? 0;
};

const mentions = (outcomes: ReturnType<typeof cross>, needle: string): boolean =>
  outcomes.some((outcome) =>
    outcome.genotype.some((token) => token.toLowerCase().includes(needle.toLowerCase())),
  );

/**
 * An unproven het used to be fed to the cross as if it had been confirmed: every entry in
 * `hets` was forced to a probability of 1 and the "50%"/"66%" in front of it was dropped.
 * A pairing of two 50% hets therefore reported the same odds as two proven hets.
 */
describe("unproven hets carry their probability", () => {
  it("treats a plain het as confirmed", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", hets: ["Het Clown"] }),
      makeAnimal({ id: "f", sex: "F", hets: ["Het Clown"] }),
    );
    // Each parent passes the allele half the time: 0.5 * 0.5.
    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(0.25, 5);
  });

  it("halves a 50% het rather than counting it as proven", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", hets: ["50% Het Clown"] }),
      makeAnimal({ id: "f", sex: "F", hets: ["50% Het Clown"] }),
    );
    // Each parent carries the allele half the time and passes it half of those: 0.25 each.
    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(0.0625, 5);
  });

  it("reads 66% as two thirds", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", hets: ["66% Het Clown"] }),
      makeAnimal({ id: "f", sex: "F", hets: ["66% Het Clown"] }),
    );
    // (2/3 * 1/2) squared.
    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(1 / 9, 5);
  });

  it("treats an unqualified possible het as a coin flip", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", hets: ["Possible Het Clown"] }),
      makeAnimal({ id: "f", sex: "F", hets: ["Possible Het Clown"] }),
    );
    expect(findProb(outcomes, ["Clown"])).toBeCloseTo(0.0625, 5);
  });

  it("still totals to one", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", hets: ["66% Het Clown"] }),
      makeAnimal({ id: "f", sex: "F", hets: ["50% Het Clown"] }),
    );
    expect(outcomes.reduce((sum, entry) => sum + entry.prob, 0)).toBeCloseTo(1, 5);
  });
});

/**
 * "Possible Pastel" records that the keeper is unsure the gene is there at all. It is a
 * label, not an allele probability, so it must stay out of the cross entirely.
 */
describe("possible visuals are label-only", () => {
  it("keeps a possible gene out of the predictions", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", morphs: [{ name: "Possible Pastel", type: "co-dom" }] }),
      makeAnimal({ id: "f", sex: "F" }),
    );
    expect(mentions(outcomes, "Pastel")).toBe(false);
  });

  it("does not disturb the real genes on the same animal", () => {
    const outcomes = cross(
      makeAnimal({
        id: "m",
        sex: "M",
        morphs: [
          { name: "Possible Pastel", type: "co-dom" },
          { name: "Enchi", type: "co-dom" },
        ],
      }),
      makeAnimal({ id: "f", sex: "F" }),
    );
    expect(mentions(outcomes, "Pastel")).toBe(false);
    expect(findProb(outcomes, ["Enchi"])).toBeCloseTo(0.5, 5);
  });
});

/**
 * Super forms are written "Super <Gene> (<Nickname>)". The genetic name has to lead:
 * Blue-Eyed Leucistic is the super of Mojave, Lesser, Butter and Phantom alike, so the
 * nickname alone could not say which allele the animal carries.
 */
describe("super forms with a trade name", () => {
  it("classifies the token as co-dominant", () => {
    expect(inferMorphType("Super Spotnose (Powerball)")).toBe("co-dom");
    expect(inferMorphType("Super Mojave (Blue-Eyed Leucistic)")).toBe("co-dom");
  });

  it("reads the super as two alleles of the base gene", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", morphs: [{ name: "Super Spotnose (Powerball)", type: "co-dom" }] }),
      makeAnimal({ id: "f", sex: "F" }),
    );
    // Homozygous parent x wild type: every offspring is a single-gene Spotnose.
    expect(findProb(outcomes, ["Spotnose"])).toBeCloseTo(1, 5);
    expect(mentions(outcomes, "Powerball")).toBe(false);
  });

  it("matches the same gene written without the trade name", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", morphs: [{ name: "Super Spotnose (Powerball)", type: "co-dom" }] }),
      makeAnimal({ id: "f", sex: "F", morphs: [{ name: "Spotnose", type: "co-dom" }] }),
    );
    // Super x single: half super, half single -- and no stray third gene.
    expect(findProb(outcomes, ["Super Spotnose"])).toBeCloseTo(0.5, 5);
    expect(findProb(outcomes, ["Spotnose"])).toBeCloseTo(0.5, 5);
  });
});

/**
 * Six real gene names carry their own parentheses, and the five Axanthic lines are
 * distinct and non-complementary. Stripping parentheses unconditionally would merge them
 * into one gene and predict visual Axanthics out of a pairing that cannot make any.
 */
describe("parenthesised gene names stay distinct", () => {
  it("does not complement one Axanthic line with another", () => {
    const outcomes = cross(
      makeAnimal({ id: "m", sex: "M", morphs: [{ name: "Axanthic (VPI)", type: "recessive" }] }),
      makeAnimal({ id: "f", sex: "F", morphs: [{ name: "Axanthic (GCR)", type: "recessive" }] }),
    );
    expect(findProb(outcomes, ["het Axanthic VPI", "het Axanthic GCR"])).toBeCloseTo(1, 5);
  });
});
