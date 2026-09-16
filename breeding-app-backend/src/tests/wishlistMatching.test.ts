import { describe, expect, it } from "vitest";
import { cleanGeneList, geneticsTokens, listingMatchesWishlist } from "../services/wishlistMatching";

const listing = {
  species: "Ball python",
  genetics: "Phantom, Het Ultramel, 50% Het Sunset, 50% Het Hypo",
  sex: "Male",
  price: 1000,
  country: "Netherlands",
};

describe("what a buyer asked to hear about", () => {
  it("matches when every wanted gene is on the animal", () => {
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom", "het ultramel"] })).toBe(true);
  });

  it("does not match when one wanted gene is missing", () => {
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom", "clown"] })).toBe(false);
  });

  /**
   * The reason genetics are split before matching. "Pastel Clown" must not be
   * satisfied by an animal carrying Pastel and, separately, Clown -- that is a
   * different snake, and telling someone otherwise is how people stop trusting
   * the alerts.
   */
  it("will not satisfy a combo by reading across a comma", () => {
    const combo = { genetics: "Pastel, Clown" };
    expect(listingMatchesWishlist(combo, { includeGenes: ["pastel clown"] })).toBe(false);
    expect(listingMatchesWishlist({ genetics: "Pastel Clown, Het Albino" }, { includeGenes: ["pastel clown"] })).toBe(true);
  });

  it("is not case sensitive, because nobody types genes the same way twice", () => {
    expect(listingMatchesWishlist({ genetics: "CLOWN, pastel" }, { includeGenes: ["Clown"] })).toBe(true);
  });

  it("drops an animal carrying an excluded gene", () => {
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], excludeGenes: ["het hypo"] })).toBe(false);
  });

  it("narrows by sex, species and country only when the buyer said so", () => {
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], sex: "female" })).toBe(false);
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], sex: "male" })).toBe(true);
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], species: "corn snake" })).toBe(false);
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], country: "netherlands" })).toBe(true);
  });

  it("respects a price ceiling", () => {
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], maxPrice: 800 })).toBe(false);
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], maxPrice: 1000 })).toBe(true);
  });

  /** "Price on inquiry" cannot be shown to clear a ceiling, so it does not. */
  it("does not offer an unpriced animal to someone who set a budget", () => {
    expect(listingMatchesWishlist({ ...listing, price: null }, { includeGenes: ["phantom"], maxPrice: 800 })).toBe(false);
    expect(listingMatchesWishlist({ ...listing, price: null }, { includeGenes: ["phantom"] })).toBe(true);
  });

  it("stays quiet for a paused entry", () => {
    expect(listingMatchesWishlist(listing, { includeGenes: ["phantom"], isActive: false })).toBe(false);
  });

  /** An entry with no criteria is a mistake; answering it with the whole catalogue is the worst reading. */
  it("matches nothing rather than everything when no criteria were given", () => {
    expect(listingMatchesWishlist(listing, {})).toBe(false);
    expect(listingMatchesWishlist(listing, { includeGenes: [] })).toBe(false);
  });
});

describe("reading the gene lists", () => {
  it("splits genetics on the separators a keeper actually types", () => {
    expect(geneticsTokens("Pastel, Clown / Het Albino")).toEqual(["pastel", "clown", "het albino"]);
  });

  it("accepts a list or a comma string, and removes repeats", () => {
    expect(cleanGeneList(["Clown", "clown", " Pastel "])).toEqual(["clown", "pastel"]);
    expect(cleanGeneList("Clown, Pastel")).toEqual(["clown", "pastel"]);
    expect(cleanGeneList(undefined)).toEqual([]);
  });

  it("caps the list so one entry cannot become a whole search engine", () => {
    expect(cleanGeneList(Array.from({ length: 30 }, (_, i) => `gene${i}`))).toHaveLength(12);
  });
});
