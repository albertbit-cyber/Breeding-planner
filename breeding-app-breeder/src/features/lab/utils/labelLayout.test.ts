import { describe, expect, it } from "vitest";
import { buildSampleLabelContent } from "./labelLayout";

const sample = (over: Record<string, unknown> = {}) => ({
  sampleId: "s-1",
  orderId: "order-1",
  orderNumber: "09AA00001",
  animalId: "26-F-186",
  animalName: "Kaa",
  breederName: "A Keeper",
  requestedTests: ["Clown", "Piebald"],
  sampleStatus: "submitted",
  qrPayload: "qr-token",
  sampleType: "shed",
  labName: "Test Lab",
  ...over,
}) as any;

/**
 * A sample label has to identify one shed on a bench: whose animal it is, which animal, and
 * what was asked for on this particular sample.
 */
describe("sample label content", () => {
  it("names the animal above its id", () => {
    // The name was carried on the label data all along and never drawn, so labels went out
    // identifying the snake by id alone.
    expect(buildSampleLabelContent(sample()).animalId).toEqual(["Kaa", "ID: 26-F-186"]);
  });

  it("falls back to the id alone when the animal has no name", () => {
    expect(buildSampleLabelContent(sample({ animalName: undefined })).animalId).toEqual([
      "Animal ID: 26-F-186",
    ]);
    expect(buildSampleLabelContent(sample({ animalName: "   " })).animalId).toEqual([
      "Animal ID: 26-F-186",
    ]);
  });

  it("still shows an id placeholder when the animal id is missing", () => {
    expect(buildSampleLabelContent(sample({ animalId: "" })).animalId).toEqual(["Kaa", "ID: -"]);
  });

  it("lists the tests requested for this shed", () => {
    const content = buildSampleLabelContent(sample());
    expect(content.requestedTests[0]).toBe("Requested Tests:");
    expect(content.requestedTests.join(" ")).toContain("Clown");
    expect(content.requestedTests.join(" ")).toContain("Piebald");
  });

  it("says so plainly when no tests were requested", () => {
    expect(buildSampleLabelContent(sample({ requestedTests: [] })).requestedTests).toEqual([
      "Requested Tests: -",
    ]);
  });

  it("carries the order number and the sample's place in the batch", () => {
    const content = buildSampleLabelContent(sample({ sampleIndex: 2, sampleCount: 7 }));
    expect(content.orderId).toEqual(["Order ID: 09AA00001", "Sample 2 of 7"]);
  });
});
