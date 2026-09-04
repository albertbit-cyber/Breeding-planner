import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyDecisions,
  buildConfirmation,
  collectDecisions,
  reapplyConfirmation,
  type GeneticsSnapshot,
} from "../services/labGeneticsRules";
import { applyConfirmedResultGenetics } from "../services/labGeneticsService";

const snapshot = (over: Partial<GeneticsSnapshot> = {}): GeneticsSnapshot => ({
  morphs: [],
  hets: [],
  possibleHets: [],
  ...over,
});

describe("labGeneticsRules", () => {
  describe("collectDecisions", () => {
    it("resolves the laboratory's test name onto the gene it reads", () => {
      const decisions = collectDecisions(
        [{ marker: "Pied", outcome: "carrierDetected" }],
        (marker) => (marker === "Pied" ? "Piebald" : null)
      );
      expect(decisions).toEqual([{ key: "piebald", gene: "Piebald", outcome: "carrierDetected" }]);
    });

    it("falls back to the test's own name when the lab mapped no gene", () => {
      const decisions = collectDecisions([{ marker: "House Panel A", outcome: "positive" }]);
      expect(decisions).toEqual([{ key: "house panel a", gene: "House Panel A", outcome: "positive" }]);
    });

    it("ignores findings that decide nothing", () => {
      expect(collectDecisions([{ marker: "Albino", outcome: "inconclusive" }])).toEqual([]);
      expect(collectDecisions([{ marker: "", outcome: "positive" }])).toEqual([]);
    });

    it("refuses a result that contradicts itself on one gene", () => {
      expect(() =>
        collectDecisions([
          { marker: "Albino", outcome: "positive" },
          { marker: "Albino", outcome: "notDetected" },
        ])
      ).toThrow(/Conflicting outcomes for gene 'Albino'/);
    });
  });

  describe("applyDecisions", () => {
    it("promotes a confirmed visual and clears the guesses it settles", () => {
      const before = snapshot({ hets: ["het Albino"], possibleHets: ["66% Albino"] });
      const after = applyDecisions(before, [{ key: "albino", gene: "Albino", outcome: "positive" }]);
      expect(after).toEqual({ morphs: ["Albino"], hets: [], possibleHets: [] });
    });

    it("promotes a carrier to a known het", () => {
      const before = snapshot({ possibleHets: ["50% het Piebald"] });
      const after = applyDecisions(before, [{ key: "piebald", gene: "Piebald", outcome: "carrierDetected" }]);
      expect(after).toEqual({ morphs: [], hets: ["Piebald"], possibleHets: [] });
    });

    it("does not add a het for an animal already visual for that gene", () => {
      const before = snapshot({ morphs: ["Albino"] });
      const after = applyDecisions(before, [{ key: "albino", gene: "Albino", outcome: "carrierDetected" }]);
      expect(after.hets).toEqual([]);
      expect(after.morphs).toEqual(["Albino"]);
    });

    it("clears only what the breeder was guessing when a test comes back negative", () => {
      const before = snapshot({ hets: ["het Clown", "66% poss het Clown"], possibleHets: ["Clown"] });
      const after = applyDecisions(before, [{ key: "clown", gene: "Clown", outcome: "notDetected" }]);
      // The certain het is the keeper's own stated fact and is left alone; the
      // percentage guess and the possible-het entry are what the test settles.
      expect(after.hets).toEqual(["het Clown"]);
      expect(after.possibleHets).toEqual([]);
    });

    it("is idempotent", () => {
      const decisions = [{ key: "albino", gene: "Albino", outcome: "positive" as const }];
      const once = applyDecisions(snapshot({ hets: ["het Albino"] }), decisions);
      expect(applyDecisions(once, decisions)).toEqual(once);
    });
  });

  describe("reapplyConfirmation", () => {
    it("removes what a stale device reintroduced after the sync's union merge", () => {
      const confirmation = buildConfirmation(null, [{ key: "clown", gene: "Clown", outcome: "notDetected" }], {
        orderId: "order-1",
        resultId: "result-1",
        confirmedAt: "2026-09-04T10:00:00.000Z",
      });

      // What the union merge produces when a phone still holding the pre-test
      // genetics pushes: the disproved guess is back.
      const merged = snapshot({ possibleHets: ["66% poss het Clown"] });

      expect(reapplyConfirmation(merged, confirmation).possibleHets).toEqual([]);
    });

    it("leaves a snapshot alone when the confirmation carries no decisions", () => {
      const before = snapshot({ morphs: ["Pastel"] });
      expect(reapplyConfirmation(before, { markers: [] })).toBe(before);
      expect(reapplyConfirmation(before, null)).toBe(before);
    });
  });

  describe("buildConfirmation", () => {
    it("supersedes an earlier verdict on the same gene rather than appending to it", () => {
      const first = buildConfirmation(null, [{ key: "albino", gene: "Albino", outcome: "carrierDetected" }], {
        orderId: "order-1",
        resultId: "result-1",
        confirmedAt: "2026-01-01T00:00:00.000Z",
      });
      const second = buildConfirmation(first, [{ key: "albino", gene: "Albino", outcome: "positive" }], {
        orderId: "order-2",
        resultId: "result-2",
        confirmedAt: "2026-06-01T00:00:00.000Z",
      });

      expect(second?.markers).toHaveLength(1);
      expect(second?.markers[0]).toMatchObject({ marker: "Albino", outcome: "positive", orderId: "order-2" });
      expect(second?.decisions).toEqual([{ key: "albino", gene: "Albino", outcome: "positive" }]);
    });

    it("keeps a negative in the decisions without listing it as a confirmed marker", () => {
      const confirmation = buildConfirmation(null, [{ key: "clown", gene: "Clown", outcome: "notDetected" }], {
        orderId: "order-1",
        resultId: "result-1",
        confirmedAt: "2026-09-04T10:00:00.000Z",
      });
      expect(confirmation?.markers).toEqual([]);
      expect(confirmation?.decisions).toHaveLength(1);
    });
  });
});

describe("applyConfirmedResultGenetics", () => {
  const tx = {
    labTestOffering: { findMany: vi.fn() },
    animal: { findMany: vi.fn(), update: vi.fn() },
  };

  const order = {
    id: "order-1",
    breederId: "breeder-1",
    animals: [{ animalId: "snake-1", tests: [{ offeringId: "off-1", testNameSnapshot: "Pied" }] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tx.labTestOffering.findMany.mockResolvedValue([
      { id: "off-1", name: "Pied", geneTarget: "Piebald", aliases: ["Pied"] },
    ]);
    tx.animal.update.mockResolvedValue({});
  });

  it("writes the confirmed gene onto the breeder's animal", async () => {
    tx.animal.findMany.mockResolvedValue([
      { id: "row-1", appAnimalId: "snake-1", payload: { possibleHets: ["50% het Piebald"] } },
    ]);

    const applications = await applyConfirmedResultGenetics(tx as any, {
      order,
      results: [{ id: "result-1", animalId: "snake-1", findingsJson: [{ marker: "Pied", outcome: "carrierDetected" }] }],
      actorUserId: "lab-user",
    });

    expect(applications[0]).toMatchObject({ animalId: "snake-1", applied: true });
    const written = tx.animal.update.mock.calls[0][0].data.payload;
    // Recorded under the gene the laboratory says the test reads, not the trade
    // name it happens to sell it under.
    expect(written.hets).toEqual(["Piebald"]);
    expect(written.possibleHets).toEqual([]);
    expect(written.labGeneticsConfirmation.decisions).toEqual([
      { key: "piebald", gene: "Piebald", outcome: "carrierDetected" },
    ]);
    // Stamped so a device still holding the old genetics cannot overwrite this.
    expect(typeof written.updatedAt).toBe("string");
  });

  it("skips an animal the breeder has never synced instead of failing the result", async () => {
    tx.animal.findMany.mockResolvedValue([]);

    const applications = await applyConfirmedResultGenetics(tx as any, {
      order,
      results: [{ id: "result-1", animalId: "snake-1", findingsJson: [{ marker: "Pied", outcome: "positive" }] }],
      actorUserId: "lab-user",
    });

    expect(applications[0]).toMatchObject({ applied: false });
    expect(applications[0].reason).toMatch(/not in the breeder's synced collection/);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  it("writes nothing when the findings match what the animal already recorded", async () => {
    tx.animal.findMany.mockResolvedValue([
      {
        id: "row-1",
        appAnimalId: "snake-1",
        payload: {
          hets: ["Piebald"],
          labGeneticsConfirmation: {
            source: "genetic-test",
            note: "Confirmed by shed test",
            confirmedAt: "2026-09-04T10:00:00.000Z",
            markers: [
              {
                marker: "Piebald",
                outcome: "carrierDetected",
                orderId: "order-1",
                resultId: "result-1",
                confirmedAt: "2026-09-04T10:00:00.000Z",
              },
            ],
            decisions: [{ key: "piebald", gene: "Piebald", outcome: "carrierDetected" }],
          },
        },
      },
    ]);

    const applications = await applyConfirmedResultGenetics(tx as any, {
      order,
      results: [{ id: "result-1", animalId: "snake-1", findingsJson: [{ marker: "Pied", outcome: "carrierDetected" }] }],
      actorUserId: "lab-user",
    });

    expect(applications[0].applied).toBe(false);
    expect(tx.animal.update).not.toHaveBeenCalled();
  });

  it("applies every animal on a multi-animal order", async () => {
    const multiOrder = {
      id: "order-2",
      breederId: "breeder-1",
      animals: [
        { animalId: "snake-1", tests: [{ offeringId: "off-1", testNameSnapshot: "Pied" }] },
        { animalId: "snake-2", tests: [{ offeringId: "off-1", testNameSnapshot: "Pied" }] },
      ],
    };
    tx.animal.findMany.mockResolvedValue([
      { id: "row-1", appAnimalId: "snake-1", payload: {} },
      { id: "row-2", appAnimalId: "snake-2", payload: {} },
    ]);

    await applyConfirmedResultGenetics(tx as any, {
      order: multiOrder,
      results: [
        { id: "r-1", animalId: "snake-1", findingsJson: [{ marker: "Pied", outcome: "positive" }] },
        { id: "r-2", animalId: "snake-2", findingsJson: [{ marker: "Pied", outcome: "notDetected" }] },
      ],
      actorUserId: "lab-user",
    });

    // The browser version only ever updated the order's first animal.
    expect(tx.animal.update).toHaveBeenCalledTimes(2);
  });
});
