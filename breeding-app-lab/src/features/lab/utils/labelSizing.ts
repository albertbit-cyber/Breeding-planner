export const DEFAULT_LAB_LABEL_SIZE_MM = Object.freeze({
  widthMm: 100,
  heightMm: 50,
});

export const LAB_LABEL_SIZE_LIMITS_MM = Object.freeze({
  min: 20,
  max: 300,
});

export const LAB_LABEL_SIZE_PRESETS = Object.freeze([
  {
    key: "small",
    label: "Small",
    widthMm: 50,
    heightMm: 30,
  },
  {
    key: "medium",
    label: "Medium",
    widthMm: 100,
    heightMm: 50,
  },
  {
    key: "large",
    label: "Large",
    widthMm: 100,
    heightMm: 100,
  },
  {
    key: "a6",
    label: "A6",
    widthMm: 105,
    heightMm: 148,
  },
] as const);

export type LabLabelPresetKey = typeof LAB_LABEL_SIZE_PRESETS[number]["key"];

export interface LabLabelSizeSettings {
  widthMm: number;
  heightMm: number;
  presetKey: LabLabelPresetKey | "custom";
}

export interface LabLabelSizeValidation {
  isValid: boolean;
  errors: string[];
}

export interface LabLabelSafeArea {
  bleedMm: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

type NumericLike = number | string | null | undefined;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const toNumber = (value: NumericLike): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const getLabLabelPresetByKey = (presetKey: unknown) =>
  LAB_LABEL_SIZE_PRESETS.find((preset) => preset.key === String(presetKey || "").trim().toLowerCase()) || null;

export const mmToPdfUnits = (mm: number): number => {
  const numeric = Number(mm);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const validateLabLabelSize = (
  widthValue: NumericLike,
  heightValue: NumericLike
): LabLabelSizeValidation => {
  const errors: string[] = [];
  const widthMm = toNumber(widthValue);
  const heightMm = toNumber(heightValue);

  if (!isFiniteNumber(widthMm)) {
    errors.push("Label width must be a number.");
  } else if (widthMm < LAB_LABEL_SIZE_LIMITS_MM.min || widthMm > LAB_LABEL_SIZE_LIMITS_MM.max) {
    errors.push(`Label width must be between ${LAB_LABEL_SIZE_LIMITS_MM.min} mm and ${LAB_LABEL_SIZE_LIMITS_MM.max} mm.`);
  }

  if (!isFiniteNumber(heightMm)) {
    errors.push("Label height must be a number.");
  } else if (heightMm < LAB_LABEL_SIZE_LIMITS_MM.min || heightMm > LAB_LABEL_SIZE_LIMITS_MM.max) {
    errors.push(`Label height must be between ${LAB_LABEL_SIZE_LIMITS_MM.min} mm and ${LAB_LABEL_SIZE_LIMITS_MM.max} mm.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const buildSettings = (
  widthMm: number,
  heightMm: number,
  presetKey: LabLabelSizeSettings["presetKey"]
): LabLabelSizeSettings => ({
  widthMm: clamp(widthMm, LAB_LABEL_SIZE_LIMITS_MM.min, LAB_LABEL_SIZE_LIMITS_MM.max),
  heightMm: clamp(heightMm, LAB_LABEL_SIZE_LIMITS_MM.min, LAB_LABEL_SIZE_LIMITS_MM.max),
  presetKey,
});

export const getDefaultLabLabelSizeSettings = (): LabLabelSizeSettings =>
  buildSettings(DEFAULT_LAB_LABEL_SIZE_MM.widthMm, DEFAULT_LAB_LABEL_SIZE_MM.heightMm, "medium");

export const normalizeLabLabelSizeSettings = (raw: unknown): LabLabelSizeSettings => {
  const defaults = getDefaultLabLabelSizeSettings();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const candidate = raw as Partial<LabLabelSizeSettings>;
  const preset = getLabLabelPresetByKey(candidate.presetKey);
  const widthMm = toNumber(candidate.widthMm);
  const heightMm = toNumber(candidate.heightMm);
  const validation = validateLabLabelSize(widthMm, heightMm);

  if (!validation.isValid) {
    return preset
      ? buildSettings(preset.widthMm, preset.heightMm, preset.key)
      : defaults;
  }

  const resolvedPresetKey =
    preset && widthMm === preset.widthMm && heightMm === preset.heightMm
      ? preset.key
      : "custom";

  return buildSettings(widthMm!, heightMm!, resolvedPresetKey);
};

export const getActiveLabelSize = (
  source?: { labLabelSettings?: unknown } | unknown
): LabLabelSizeSettings => {
  if (source && typeof source === "object" && Object.prototype.hasOwnProperty.call(source, "labLabelSettings")) {
    return normalizeLabLabelSizeSettings((source as { labLabelSettings?: unknown }).labLabelSettings);
  }
  return normalizeLabLabelSizeSettings(source);
};

export const getLabelSafeArea = (
  source?: { labLabelSettings?: unknown } | unknown,
  bleedMm = 5
): LabLabelSafeArea => {
  const size = getActiveLabelSize(source);
  const safeBleed = clamp(Number(bleedMm) || 5, 0, Math.min(size.widthMm, size.heightMm) / 2);
  return {
    bleedMm: safeBleed,
    xMm: safeBleed,
    yMm: safeBleed,
    widthMm: Math.max(0, size.widthMm - (safeBleed * 2)),
    heightMm: Math.max(0, size.heightMm - (safeBleed * 2)),
  };
};
