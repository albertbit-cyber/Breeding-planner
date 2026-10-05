import { describe, expect, it } from "vitest";
import {
  claimsOf,
  geneToken,
  isGeneLanguage,
  normalizeGeneToken,
  parseGeneToken,
  provenanceText,
  tokenLabel,
  zygosityText,
} from "./genetics";

// Echoes the default, with interpolation, so assertions read like the UI.
const t = (_key, options = {}) =>
  String(options.defaultValue || "").replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name] ?? ""));

describe("parseGeneToken", () => {
  it("reads a bare gene as a visual", () => {
    expect(parseGeneToken("clown")).toEqual({ gene: "Clown", zygosity: "visual" });
    expect(parseGeneToken("visual pied")).toEqual({ gene: "Pied", zygosity: "visual" });
  });

  it("reads the hobby's het shorthand", () => {
    expect(parseGeneToken("het clown")).toEqual({ gene: "Clown", zygosity: "het" });
    expect(parseGeneToken("100% het clown")).toEqual({ gene: "Clown", zygosity: "het" });
    expect(parseGeneToken("66% het hypo")).toEqual({ gene: "Hypo", zygosity: "possible_het" });
    expect(parseGeneToken("pos het ghost")).toEqual({ gene: "Ghost", zygosity: "possible_het" });
    expect(parseGeneToken("ph albino")).toEqual({ gene: "Albino", zygosity: "possible_het" });
  });

  it("keeps multi-word genes whole", () => {
    expect(parseGeneToken("het lavender albino")).toEqual({ gene: "Lavender Albino", zygosity: "het" });
  });

  it("returns null for nothing", () => {
    expect(parseGeneToken("")).toBeNull();
    expect(parseGeneToken("   ")).toBeNull();
  });
});

describe("tokens", () => {
  it("writes the canonical token the URL carries", () => {
    expect(geneToken("clown")).toBe("Clown");
    expect(geneToken("clown", "het")).toBe("het Clown");
    expect(geneToken("clown", "possible_het")).toBe("pos het Clown");
    expect(normalizeGeneToken("  66%   het   hypo ")).toBe("pos het Hypo");
  });

  it("knows when a search is gene language", () => {
    expect(isGeneLanguage("het pied")).toBe(true);
    expect(isGeneLanguage("50% het pied")).toBe(true);
    expect(isGeneLanguage("Berlin")).toBe(false);
    expect(isGeneLanguage("hetzner")).toBe(false);
  });

  it("labels a bare token as a visual so it cannot be read as 'any'", () => {
    expect(tokenLabel("Clown", t)).toBe("visual Clown");
    expect(tokenLabel("het Clown", t)).toBe("het Clown");
    expect(tokenLabel("pos het Clown", t)).toBe("pos het Clown");
  });
});

describe("claims", () => {
  it("uses the API's claims when present", () => {
    const claims = [{ label: "Clown", zygosity: "visual", provenance: "lab_confirmed" }];
    expect(claimsOf({ geneticClaims: claims })).toBe(claims);
  });

  it("falls back to the genetics line, untested", () => {
    expect(claimsOf({ genetics: "Clown, het Pied" })).toEqual([
      expect.objectContaining({ label: "Clown", zygosity: "visual", provenance: "observed", lab: null }),
      expect.objectContaining({ label: "het Pied", zygosity: "het", provenance: "predicted", lab: null }),
    ]);
    expect(claimsOf({})).toEqual([]);
  });

  it("says where each claim comes from, never just 'verified'", () => {
    expect(provenanceText({ provenance: "observed" }, t)).toBe("Observed by the seller, not tested");
    expect(provenanceText({ provenance: "predicted", percent: 66 }, t)).toBe("Predicted from the pairing, 66% odds");
    expect(provenanceText({ provenance: "predicted", percent: null }, t)).toBe("Predicted from the pairing, not tested");
    expect(provenanceText({ provenance: "lab_confirmed", lab: { certificateNumber: "C-9" } }, t)).toBe(
      "Lab-confirmed, certificate C-9"
    );
  });

  it("names zygosity in the hobby's words", () => {
    expect(zygosityText({ zygosity: "visual" }, t)).toBe("visual");
    expect(zygosityText({ zygosity: "visual", homozygous: true }, t)).toBe("visual (super)");
    expect(zygosityText({ zygosity: "het" }, t)).toBe("het");
    expect(zygosityText({ zygosity: "possible_het" }, t)).toBe("possible het");
  });
});
