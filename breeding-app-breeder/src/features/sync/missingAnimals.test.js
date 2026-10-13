import { describe, expect, it } from "vitest";
import { findMissingAnimalReferences, unlinkAnimalFromPairings } from "./missingAnimals";

const snakes = [{ id: "F1", name: "Hera" }, { id: "M1", name: "Zeus" }];

describe("animals named but missing", () => {
  it("lists ids that pairings and cards name but the collection lacks, with who names them", () => {
    const pairings = [
      { id: "p1", femaleId: "F1", maleId: "22SPOCLO-M-188" },
      { id: "p2", femaleId: "F1", maleId: "M1" },
      { id: "demo", femaleId: "F1", maleId: "GHOST", isDemo: true },
    ];
    const cycles = [
      { id: "bc-legacy-p1", femaleId: "F1", males: [{ maleId: "22SPOCLO-M-188" }], sessions: [{ maleId: "22SPOCLO-M-188" }] },
      { id: "bc-gone", femaleId: "F1", males: [{ maleId: "OLD" }], deletedAt: "2026-10-01T00:00:00.000Z" },
    ];

    expect(findMissingAnimalReferences({ snakes, pairings, cycles })).toEqual([
      { animalId: "22SPOCLO-M-188", pairingIds: ["p1"], cycleIds: ["bc-legacy-p1"] },
    ]);
  });

  it("keeps the name on the pairing and removes only the link", () => {
    const pairings = [
      { id: "p1", label: "Hera × 22SPOCLO-M-188", femaleId: "F1", maleId: "22SPOCLO-M-188" },
      { id: "p2", femaleId: "F1", maleId: "M1" },
    ];
    const next = unlinkAnimalFromPairings(pairings, "22SPOCLO-M-188");

    expect(next[0]).toEqual({ id: "p1", label: "Hera × 22SPOCLO-M-188", femaleId: "F1", maleId: "", maleName: "22SPOCLO-M-188" });
    expect(next[1]).toBe(pairings[1]);
    expect(findMissingAnimalReferences({ snakes, pairings: next })).toEqual([]);
  });

  it("returns the same array when nothing names the id", () => {
    const pairings = [{ id: "p2", femaleId: "F1", maleId: "M1" }];
    expect(unlinkAnimalFromPairings(pairings, "22SPOCLO-M-188")).toBe(pairings);
  });
});
