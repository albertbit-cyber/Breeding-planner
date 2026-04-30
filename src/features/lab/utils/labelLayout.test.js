import { describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+y3N8AAAAASUVORK5CYII="),
}));

import {
  buildSampleLabelContent,
  buildSampleLabelLayout,
  buildShippingLabelContent,
  buildShippingLabelLayout,
  fitQrToBox,
  fitTextToBox,
  SAMPLE_LABEL_TESTS_FIT_OPTIONS,
} from "./labelLayout";
import { getLabelSafeArea } from "./labelSizing";
import { generateOrderLabelsPdf } from "../../../utils/pdf/labOrderLabelsPdf";

describe("lab label layout engine", () => {
  it("keeps all layout boxes inside the safe area for a very small label", () => {
    const size = { widthMm: 50, heightMm: 30, presetKey: "small" };
    const safeArea = getLabelSafeArea(size, 5);
    const layout = buildSampleLabelLayout(size, safeArea);
    [layout.orderIdBox, layout.animalIdBox, layout.breederNameBox, layout.testsBox, layout.qrBox].forEach((box) => {
      expect(box.xMm).toBeGreaterThanOrEqual(safeArea.xMm);
      expect(box.yMm).toBeGreaterThanOrEqual(safeArea.yMm);
      expect(box.xMm + box.widthMm).toBeLessThanOrEqual(safeArea.xMm + safeArea.widthMm + 0.001);
      expect(box.yMm + box.heightMm).toBeLessThanOrEqual(safeArea.yMm + safeArea.heightMm + 0.001);
    });
  });

  it("shrinks or truncates long breeder names safely", () => {
    const box = { key: "breeder", xMm: 5, yMm: 5, widthMm: 35, heightMm: 8 };
    const fitted = fitTextToBox("This is an extremely long breeder name that must not overflow the label", box, {
      maxFontPt: 9,
      minFontPt: 6,
      maxLines: 2,
    });
    expect(fitted.fontSizePt).toBeGreaterThanOrEqual(6);
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
  });

  it("fits many requested tests inside the tests box", () => {
    const size = { widthMm: 100, heightMm: 50, presetKey: "medium" };
    const safeArea = getLabelSafeArea(size, 5);
    const layout = buildSampleLabelLayout(size, safeArea);
    const requestedTests = ["Clown", "Ultramel", "Hypo", "Puzzle", "Desert Ghost", "Sunset", "Monsoon"];
    const content = buildSampleLabelContent({
      sampleId: "s1",
      orderId: "o1",
      orderNumber: "ORDER-1",
      animalId: "A1",
      breederName: "Breeder",
      requestedTests,
      sampleStatus: "pending",
      qrPayload: "qr",
      sampleType: "shed",
      labName: "Lab",
    });
    const fitted = fitTextToBox(content.requestedTests, layout.testsBox, SAMPLE_LABEL_TESTS_FIT_OPTIONS[layout.variant]);
    expect(fitted.truncated).toBe(false);
    requestedTests.forEach((test) => {
      expect(fitted.lines.join(" ")).toContain(test);
    });
  });

  it("keeps QR codes inside the QR box", () => {
    const size = { widthMm: 100, heightMm: 50, presetKey: "medium" };
    const safeArea = getLabelSafeArea(size, 5);
    const layout = buildSampleLabelLayout(size, safeArea);
    const qr = fitQrToBox(layout.qrBox);
    expect(qr.xMm).toBeGreaterThanOrEqual(layout.qrBox.xMm);
    expect(qr.yMm).toBeGreaterThanOrEqual(layout.qrBox.yMm);
    expect(qr.xMm + qr.sizeMm).toBeLessThanOrEqual(layout.qrBox.xMm + layout.qrBox.widthMm + 0.001);
    expect(qr.yMm + qr.sizeMm).toBeLessThanOrEqual(layout.qrBox.yMm + layout.qrBox.heightMm + 0.001);
  });

  it("builds shipping content with destination and sender blocks only", () => {
    const size = { widthMm: 100, heightMm: 50, presetKey: "medium" };
    const safeArea = getLabelSafeArea(size, 5);
    const layout = buildShippingLabelLayout(size, safeArea);
    const content = buildShippingLabelContent({
      orderId: "o1",
      orderNumber: "ORDER-1",
      labName: "Lab",
      labAddress: { line1: "123 Lab Lane", city: "Phoenix", postalCode: "85001", country: "US" },
      breeder: {
        name: "Breeder",
        address: { line1: "456 Breeder Rd", city: "Berlin", postalCode: "10115", country: "DE" },
      },
      createdAt: new Date().toISOString(),
      sampleCount: 4,
    });
    expect(layout.destinationBox.heightMm).toBeGreaterThan(0);
    expect(layout.senderBox.heightMm).toBeGreaterThan(0);
    expect(content.destinationLines[0]).toBe("TO");
    expect(content.senderLines[0]).toBe("FROM");
  });

  it("generates one multi-page PDF for a 4-sample order", async () => {
    const artifact = await generateOrderLabelsPdf({
      size: { widthMm: 100, heightMm: 50, presetKey: "medium" },
      debug: true,
      shippingLabel: {
        orderId: "o1",
        orderNumber: "ORDER-1",
        labName: "Lab",
        labAddress: { line1: "123 Lab Lane", city: "Phoenix", postalCode: "85001", country: "US" },
        breeder: {
          name: "Breeder",
          address: { line1: "456 Breeder Rd", city: "Berlin", postalCode: "10115", country: "DE" },
        },
        createdAt: new Date().toISOString(),
        sampleCount: 4,
      },
      sampleLabels: [1, 2, 3, 4].map((index) => ({
        sampleId: `s${index}`,
        orderId: "o1",
        orderNumber: "ORDER-1",
        animalId: `A${index}`,
        breederName: "Breeder",
        requestedTests: ["Clown", "Ultramel", "Hypo"],
        sampleStatus: "pending",
        qrPayload: `qr-${index}`,
        sampleType: "shed",
        labName: "Lab",
      })),
    });
    expect(artifact.pageCount).toBe(5);
    expect(artifact.pageWidthMm).toBe(100);
    expect(artifact.pageHeightMm).toBe(50);
  });

  it("switches sample layout responsively", () => {
    const wide = buildSampleLabelLayout(
      { widthMm: 100, heightMm: 50, presetKey: "medium" },
      getLabelSafeArea({ widthMm: 100, heightMm: 50, presetKey: "medium" }, 5)
    );
    const stacked = buildSampleLabelLayout(
      { widthMm: 60, heightMm: 60, presetKey: "custom" },
      getLabelSafeArea({ widthMm: 60, heightMm: 60, presetKey: "custom" }, 5)
    );
    expect(wide.variant).toBe("side-by-side");
    expect(stacked.variant).toBe("stacked");
  });
});
