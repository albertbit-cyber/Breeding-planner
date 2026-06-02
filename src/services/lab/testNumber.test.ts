import { describe, expect, it } from "vitest";
import { buildLabTestNumber, isLabTestNumber, resolveLabTestNumber } from "./testNumber";

describe("lab test number helpers", () => {
  it("builds a deterministic test number in the required format", () => {
    const first = buildLabTestNumber("order-123", "2026-04-24T10:00:00.000Z");
    const second = buildLabTestNumber("order-123", "2026-04-24T10:00:00.000Z");

    expect(first).toBe(second);
    expect(first).toMatch(/^\d{6}[A-Z]{2}\d{4}$/);
    expect(isLabTestNumber(first)).toBe(true);
  });

  it("keeps a valid incoming test number", () => {
    expect(resolveLabTestNumber("260424PH1061", "order-123", "2026-04-24")).toBe("260424PH1061");
  });

  it("replaces an invalid incoming test number with a formatted one", () => {
    const resolved = resolveLabTestNumber("shed_panel_v1", "order-123", "2026-04-24");
    expect(resolved).toMatch(/^\d{6}[A-Z]{2}\d{4}$/);
  });
});
