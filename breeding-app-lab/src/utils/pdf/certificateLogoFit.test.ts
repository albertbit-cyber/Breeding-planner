import { describe, expect, it } from "vitest";
import { fitLogoBox } from "./labCertificatePdf";

// The header box the logo is fitted into.
const MAX_W = 58;
const MAX_H = 34;
const CENTER_X = 105;
const TOP_Y = 7;

describe("fitting a laboratory logo into the certificate header", () => {
  it("scales a wide wordmark to the width without distorting it", () => {
    // 1200x300 -- a typical wordmark. Stretched to fill 58x34 it came out
    // nearly twice as tall as it should be.
    const box = fitLogoBox(1200, 300);

    expect(box.width).toBeCloseTo(MAX_W, 5);
    expect(box.height).toBeCloseTo(MAX_W / 4, 5);
    expect(box.width / box.height).toBeCloseTo(4, 5);
  });

  it("scales a tall mark to the height instead", () => {
    const box = fitLogoBox(300, 1200);

    expect(box.height).toBeCloseTo(MAX_H, 5);
    expect(box.width).toBeCloseTo(MAX_H / 4, 5);
  });

  it("never exceeds the box in either direction", () => {
    [[1200, 300], [300, 1200], [512, 512], [2400, 20], [20, 2400]].forEach(([w, h]) => {
      const box = fitLogoBox(w, h);
      expect(box.width).toBeLessThanOrEqual(MAX_W + 1e-9);
      expect(box.height).toBeLessThanOrEqual(MAX_H + 1e-9);
    });
  });

  it("centres the mark horizontally", () => {
    const box = fitLogoBox(1200, 300);
    expect(box.x + (box.width / 2)).toBeCloseTo(CENTER_X, 5);
  });

  it("sits the mark on the bottom of the box, whatever its shape", () => {
    // So a short wide logo and a tall one share a baseline with the issuer
    // details printed beside them.
    const wide = fitLogoBox(1200, 300);
    const square = fitLogoBox(512, 512);
    expect(wide.y + wide.height).toBeCloseTo(TOP_Y + MAX_H, 5);
    expect(square.y + square.height).toBeCloseTo(TOP_Y + MAX_H, 5);
  });

  it("falls back to the full box when the image cannot be measured", () => {
    // Reachable only where there is no DOM to read an intrinsic size from.
    [fitLogoBox(0, 0), fitLogoBox(NaN, 100), fitLogoBox(100, -5)].forEach((box) => {
      expect(box.width).toBe(MAX_W);
      expect(box.height).toBe(MAX_H);
      expect(box.y).toBe(TOP_Y);
    });
  });
});
