// @ts-nocheck

import { describe, expect, it, vi } from "vitest";
import { applyConfirmedResultGeneticsUpdate } from "../src/services/lab/geneticsUpdateEngine";

const makeActor = () => ({
  userId: "lab.tech@example.com",
  role: "lab_staff",
  labId: "proherper-main-lab",
});

const makeOrder = (overrides = {}) => ({
  id: "order_1",
  labId: "proherper-main-lab",
  animalId: "snake_1",
  orderNumber: "GT-1",
  status: "result_entered",
  requestedTests: ["Monsoon"],
  priority: "routine",
  sampleIds: ["sample_1"],
  resultIds: [],
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
  ...overrides,
});

const makeResult = (overrides = {}) => ({
  id: "result_1",
  labId: "proherper-main-lab",
  orderId: "order_1",
  sampleId: "sample_1",
  animalId: "snake_1",
  status: "completed",
  testCode: "GEN-PANEL",
  findings: [],
  createdAt: "2026-03-17T00:00:00.000Z",
  updatedAt: "2026-03-17T00:00:00.000Z",
  ...overrides,
});

describe("applyConfirmedResultGeneticsUpdate", () => {
  it("promotes a possible het to confirmed het while preserving unrelated genes", async () => {
    const snakes = [
      {
        id: "snake_1",
        name: "Aurora",
        morphs: ["Clown"],
        hets: ["Hypo"],
        possibleHets: ["50% Monsoon", "66% Pied"],
      },
    ];

    const loadSnakes = vi.fn(async () => snakes);
    const saveSnakes = vi.fn(async () => undefined);
    const createChangeLog = vi.fn((input) => ({ id: "gcl_1", ...input }));

    const response = await applyConfirmedResultGeneticsUpdate(
      {
        actor: makeActor(),
        order: makeOrder(),
        result: makeResult({
          findings: [{ marker: "Monsoon", outcome: "positive" }],
        }),
      },
      {
        snakeDataGateway: { loadSnakes, saveSnakes },
        createChangeLog,
        now: () => "2026-03-17T01:00:00.000Z",
        makeId: () => "gcl_1",
      }
    );

    expect(response.applied).toBe(true);
    expect(response.changeLogId).toBe("gcl_1");

    const saved = saveSnakes.mock.calls[0][0][0];
    expect(saved.morphs).toEqual(["Clown"]);
    expect(saved.hets).toEqual(["Hypo", "Monsoon"]);
    expect(saved.possibleHets).toEqual(["66% Pied"]);

    expect(createChangeLog).toHaveBeenCalledTimes(1);
    const logInput = createChangeLog.mock.calls[0][0];
    expect(logInput.orderId).toBe("order_1");
    expect(logInput.resultId).toBe("result_1");
    expect(logInput.before.hets).toEqual(["Hypo"]);
    expect(logInput.after.hets).toEqual(["Hypo", "Monsoon"]);
  });

  it("removes tested gene from het and possible lists on negative outcome", async () => {
    const snakes = [
      {
        id: "snake_1",
        morphs: ["Clown"],
        hets: ["Monsoon", "Hypo"],
        possibleHets: ["Monsoon", "66% Pied"],
      },
    ];

    const saveSnakes = vi.fn(async () => undefined);

    const response = await applyConfirmedResultGeneticsUpdate(
      {
        actor: makeActor(),
        order: makeOrder(),
        result: makeResult({
          findings: [{ marker: "Monsoon", outcome: "negative" }],
        }),
      },
      {
        snakeDataGateway: {
          loadSnakes: async () => snakes,
          saveSnakes,
        },
        createChangeLog: (input) => ({ id: "gcl_2", ...input }),
        makeId: () => "gcl_2",
      }
    );

    expect(response.applied).toBe(true);
    const saved = saveSnakes.mock.calls[0][0][0];
    expect(saved.hets).toEqual(["Hypo"]);
    expect(saved.possibleHets).toEqual(["66% Pied"]);
    expect(saved.morphs).toEqual(["Clown"]);
  });

  it("returns no-op when findings are inconclusive", async () => {
    const saveSnakes = vi.fn(async () => undefined);

    const response = await applyConfirmedResultGeneticsUpdate(
      {
        actor: makeActor(),
        order: makeOrder(),
        result: makeResult({ findings: [{ marker: "Monsoon", outcome: "inconclusive" }] }),
      },
      {
        snakeDataGateway: {
          loadSnakes: async () => [{ id: "snake_1", morphs: ["Clown"], hets: [], possibleHets: ["Monsoon"] }],
          saveSnakes,
        },
      }
    );

    expect(response.applied).toBe(false);
    expect(response.reason).toContain("No confirmed gene findings");
    expect(saveSnakes).not.toHaveBeenCalled();
  });
});
