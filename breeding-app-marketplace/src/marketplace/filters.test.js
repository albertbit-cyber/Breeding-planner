import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  activeChips,
  addGeneToken,
  countActive,
  cycleGene,
  fromSearchParams,
  geneState,
  toSearchParams,
} from "./filters";

const t = (_key, options = {}) =>
  String(options.defaultValue || "").replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ""));

const filters = (patch = {}) => ({ ...DEFAULT_FILTERS, ...patch });

describe("URL round trip", () => {
  it("survives a share link: what goes into the URL comes back out", () => {
    const original = filters({
      species: "Ball python",
      sex: "female",
      includeGenes: "Clown, het Pied",
      minPrice: "200",
      maxPrice: "600",
      sort: "price_low",
    });
    const params = toSearchParams(original);
    expect(fromSearchParams(new URLSearchParams(params.toString()))).toEqual(original);
  });

  it("keeps defaults out of the URL so a plain browse has a plain address", () => {
    expect(toSearchParams(filters({ sort: "best", page: "1" })).toString()).toBe("");
  });

  it("ignores an unknown sort from a hand-edited link", () => {
    expect(fromSearchParams(new URLSearchParams("sort=cheapest")).sort).toBe("best");
  });
});

describe("gene chips", () => {
  it("cycles visual, het, ruled out, off", () => {
    let current = filters();
    const step = () => {
      current = { ...current, ...cycleGene(current, "Clown") };
      return geneState(current, "Clown");
    };
    expect(geneState(current, "Clown")).toBe("off");
    expect(step()).toBe("visual");
    expect(current.includeGenes).toBe("Clown");
    expect(step()).toBe("het");
    expect(current.includeGenes).toBe("het Clown");
    expect(step()).toBe("exclude");
    expect(current.includeGenes).toBe("");
    expect(current.excludeGenes).toBe("Clown");
    expect(step()).toBe("off");
    expect(current.excludeGenes).toBe("");
  });

  it("leaves other genes alone", () => {
    const next = cycleGene(filters({ includeGenes: "Pied" }), "Clown");
    expect(next.includeGenes).toBe("Pied, Clown");
  });

  it("adds a typed token once, replacing the same gene at another zygosity", () => {
    const next = addGeneToken(filters({ includeGenes: "Clown", excludeGenes: "Pied" }), "het clown");
    expect(next.includeGenes).toBe("het Clown");
    expect(addGeneToken(filters({ excludeGenes: "Pied" }), "pied").excludeGenes).toBe("");
    expect(addGeneToken(filters(), "")).toEqual({});
  });
});

describe("chips and counts", () => {
  it("says visual, het or ruled out on each gene chip", () => {
    const labels = activeChips(filters({ includeGenes: "Clown, het Pied", excludeGenes: "Spider" }), t).map(
      (chip) => chip.label
    );
    expect(labels).toEqual(expect.arrayContaining(["visual Clown", "het Pied", "no visual Spider"]));
  });

  it("removing a chip removes exactly that filter", () => {
    const current = filters({ includeGenes: "Clown, het Pied", species: "Corn snake" });
    const chips = activeChips(current, t);
    expect(chips.find((chip) => chip.key === "gene-in-het Pied").patch).toEqual({ includeGenes: "Clown" });
    expect(chips.find((chip) => chip.key === "species").patch).toEqual({ species: "" });
  });

  it("counts species, price and every gene token", () => {
    expect(countActive(filters({ species: "Ball python", maxPrice: "500", includeGenes: "Clown, het Pied" }))).toBe(4);
    expect(countActive(filters())).toBe(0);
  });
});
