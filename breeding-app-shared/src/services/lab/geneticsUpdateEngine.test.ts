import { describe, expect, it } from "vitest";
import { applyConfirmedResultGeneticsUpdate } from "./geneticsUpdateEngine";

const createGateway = (snakes: any[]) => {
  let current = snakes.map((entry) => ({ ...entry }));
  return {
    gateway: {
      async loadSnakes() {
        return current.map((entry) => ({ ...entry }));
      },
      async saveSnakes(nextSnakes: any[]) {
        current = nextSnakes.map((entry) => ({ ...entry }));
      },
    },
    read() {
      return current.map((entry) => ({ ...entry }));
    },
  };
};

const depsFor = (gateway: any) => ({
  snakeDataGateway: gateway,
  createChangeLog: () => ({ id: "gcl-test" } as any),
});

const actor = {
  userId: "lab-user",
  role: "lab_staff",
  labId: "lab-1",
} as const;

const order = {
  id: "order-1",
  labId: "lab-1",
  animalId: "snake-1",
} as any;

describe("applyConfirmedResultGeneticsUpdate", () => {
  it("upgrades an uncertain het to a proven het for heterozygous results", async () => {
    const state = createGateway([{ id: "snake-1", morphs: ["GHI"], hets: ["50% Clown"], possibleHets: [] }]);

    const result = await applyConfirmedResultGeneticsUpdate({
      actor,
      order,
      result: {
        id: "result-het",
        animalId: "snake-1",
        findings: [{ marker: "Clown", outcome: "carrierDetected" }],
      } as any,
    }, depsFor(state.gateway));

    expect(result.after).toEqual({
      morphs: ["GHI"],
      hets: ["Clown"],
      possibleHets: [],
    });
  });

  it("promotes a gene to visual for positive results", async () => {
    const state = createGateway([{ id: "snake-1", morphs: ["GHI"], hets: ["66% Pied"], possibleHets: [] }]);

    const result = await applyConfirmedResultGeneticsUpdate({
      actor,
      order,
      result: {
        id: "result-visual",
        animalId: "snake-1",
        findings: [{ marker: "Pied", outcome: "positive" }],
      } as any,
    }, depsFor(state.gateway));

    expect(result.after).toEqual({
      morphs: ["GHI", "Pied"],
      hets: [],
      possibleHets: [],
    });
  });

  it("removes only uncertain het calls for negative results", async () => {
    const state = createGateway([{
      id: "snake-1",
      morphs: ["GHI"],
      hets: ["Clown", "50% Pied"],
      possibleHets: ["Lavender Albino"],
    }]);

    const result = await applyConfirmedResultGeneticsUpdate({
      actor,
      order,
      result: {
        id: "result-negative",
        animalId: "snake-1",
        findings: [
          { marker: "Pied", outcome: "notDetected" },
          { marker: "Lavender Albino", outcome: "negative" },
        ],
      } as any,
    }, depsFor(state.gateway));

    expect(result.after).toEqual({
      morphs: ["GHI"],
      hets: ["Clown"],
      possibleHets: [],
    });
  });
});
