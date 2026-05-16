import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAB_LABEL_SIZE_MM,
  getActiveLabelSize,
  getLabelSafeArea,
  getDefaultLabLabelSizeSettings,
  mmToPdfUnits,
  normalizeLabLabelSizeSettings,
  validateLabLabelSize,
} from "./labelSizing";

describe("lab label sizing", () => {
  it("uses the default size when no custom settings exist", () => {
    expect(getActiveLabelSize(null)).toEqual({
      widthMm: DEFAULT_LAB_LABEL_SIZE_MM.widthMm,
      heightMm: DEFAULT_LAB_LABEL_SIZE_MM.heightMm,
      presetKey: "medium",
    });
  });

  it("uses a saved 50x30 mm custom size", () => {
    expect(getActiveLabelSize({
      labLabelSettings: {
        widthMm: 50,
        heightMm: 30,
        presetKey: "small",
      },
    })).toEqual({
      widthMm: 50,
      heightMm: 30,
      presetKey: "small",
    });
  });

  it("uses a saved 100x100 mm custom size", () => {
    expect(getActiveLabelSize({
      widthMm: 100,
      heightMm: 100,
      presetKey: "large",
    })).toEqual({
      widthMm: 100,
      heightMm: 100,
      presetKey: "large",
    });
  });

  it("returns to the default size when reset", () => {
    expect(normalizeLabLabelSizeSettings(getDefaultLabLabelSizeSettings())).toEqual({
      widthMm: DEFAULT_LAB_LABEL_SIZE_MM.widthMm,
      heightMm: DEFAULT_LAB_LABEL_SIZE_MM.heightMm,
      presetKey: "medium",
    });
  });

  it("falls back safely when settings are missing or corrupted", () => {
    expect(getActiveLabelSize({
      labLabelSettings: {
        widthMm: -10,
        heightMm: "bad",
        presetKey: "unknown",
      },
    })).toEqual({
      widthMm: DEFAULT_LAB_LABEL_SIZE_MM.widthMm,
      heightMm: DEFAULT_LAB_LABEL_SIZE_MM.heightMm,
      presetKey: "medium",
    });
  });

  it("validates bounds and keeps PDF units in millimeters", () => {
    expect(validateLabLabelSize(0, 10).isValid).toBe(false);
    expect(validateLabLabelSize(100, 50)).toEqual({ isValid: true, errors: [] });
    expect(mmToPdfUnits(50)).toBe(50);
    expect(mmToPdfUnits(100)).toBe(100);
  });

  it("builds a 5 mm safe area inside the active label size", () => {
    expect(getLabelSafeArea({ widthMm: 100, heightMm: 50, presetKey: "medium" }, 5)).toEqual({
      bleedMm: 5,
      xMm: 5,
      yMm: 5,
      widthMm: 90,
      heightMm: 40,
    });
  });
});
