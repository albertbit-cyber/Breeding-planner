import {
  DEFAULT_LABEL_PRESET_ID,
  LABEL_BRANDS,
  LABEL_CATEGORIES,
  LABEL_PRESETS,
  cmToPoints,
  generateSheetGrid,
  getPageSizeMm,
  getPresetById,
  inchToPoints,
  LabelBrand,
  LabelCategory,
  LabelPageSize,
  LabelUnit,
  LabelValidationResult,
  mmToPoints,
  toMillimeters,
  validatePreset,
} from '../../constants/labelPresets';

export type LabelFormatType = 'thermal' | 'sheet' | 'custom';
export type { LabelUnit };

export interface PdfLabelSettings {
  formatType: LabelFormatType;
  brand: LabelBrand;
  category: LabelCategory;
  presetKey: string;
  unit: LabelUnit;
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
  columns: number;
  rows: number;
  pageWidth: number;
  pageHeight: number;
  pageSize: LabelPageSize;
}

export interface LabelPreset {
  key: string;
  brand: LabelBrand;
  category: LabelCategory;
  name: string;
  formatType: Exclude<LabelFormatType, 'custom'>;
  unit: LabelUnit;
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
  columns: number;
  rows: number;
  pageWidth: number;
  pageHeight: number;
  pageSize: LabelPageSize;
}

export interface ResolvedPdfLabelLayout {
  mode: 'thermal' | 'sheet';
  pageWidthMm: number;
  pageHeightMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  gapXmm: number;
  gapYmm: number;
  columns: number;
  rows: number;
}

const toFeaturePreset = (source: typeof LABEL_PRESETS[number]): LabelPreset => {
  const page = source.pageSize === 'CUSTOM'
    ? { width: source.width, height: source.height }
    : getPageSizeMm(source.pageSize);
  const labelWidthMm = toMillimeters(source.width, source.unit);
  const labelHeightMm = toMillimeters(source.height, source.unit);
  const horizontalRemaining = Math.max(0, page.width - (labelWidthMm * source.columns));
  const verticalRemaining = Math.max(0, page.height - (labelHeightMm * source.rows));
  const inferredMarginLeft = source.format === 'sheet'
    ? (source.columns > 0 ? horizontalRemaining / (source.columns + 1) : 0)
    : 0;
  const inferredMarginTop = source.format === 'sheet'
    ? (source.rows > 0 ? verticalRemaining / (source.rows + 1) : 0)
    : 0;

  return {
    key: source.id,
    brand: source.brand,
    category: source.category,
    name: source.displayName,
    formatType: source.format,
    unit: source.unit,
    width: source.width,
    height: source.height,
    marginTop: inferredMarginTop,
    marginRight: inferredMarginLeft,
    marginBottom: inferredMarginTop,
    marginLeft: inferredMarginLeft,
    gapX: inferredMarginLeft,
    gapY: inferredMarginTop,
    columns: source.columns,
    rows: source.rows,
    pageWidth: page.width,
    pageHeight: page.height,
    pageSize: source.pageSize,
  };
};

export const FEATURE_LABEL_PRESETS: LabelPreset[] = LABEL_PRESETS.map(toFeaturePreset);
export const LABEL_PRESETS_V2 = FEATURE_LABEL_PRESETS;

export const DEFAULT_LABEL_PRESET = {
  formatType: 'thermal' as const,
  brand: 'Zebra' as const,
  presetKey: DEFAULT_LABEL_PRESET_ID,
};

const clampNumber = (value: unknown, fallback: number, { min = 0, max = Number.POSITIVE_INFINITY } = {}): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < min) return min;
  if (numeric > max) return max;
  return numeric;
};

const normalizeFormatType = (value: unknown): LabelFormatType => {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'sheet' || token === 'custom') return token;
  return 'thermal';
};

const normalizeUnit = (value: unknown): LabelUnit => {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'cm') return 'cm';
  if (token === 'in' || token === 'inch') return 'in';
  return 'mm';
};

const normalizeBrand = (value: unknown): LabelBrand => {
  const token = String(value || '').trim().toLowerCase();
  const match = LABEL_BRANDS.find((brand) => brand.toLowerCase() === token);
  return match || 'Custom';
};

const normalizeCategory = (value: unknown): LabelCategory => {
  const token = String(value || '').trim().toLowerCase();
  const match = LABEL_CATEGORIES.find((category) => category.toLowerCase() === token);
  return match || 'Rectangle';
};

const buildDefaultSettings = (): PdfLabelSettings => {
  const preset = getPresetById(DEFAULT_LABEL_PRESET_ID);
  const resolved = preset ? toFeaturePreset(preset) : null;
  if (!resolved) {
    return {
      formatType: 'thermal',
      brand: 'Zebra',
      category: 'Shipping',
      presetKey: DEFAULT_LABEL_PRESET_ID,
      unit: 'mm',
      width: 100,
      height: 50,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      gapX: 0,
      gapY: 0,
      columns: 1,
      rows: 1,
      pageWidth: 100,
      pageHeight: 50,
      pageSize: 'CUSTOM',
    };
  }

  return {
    formatType: resolved.formatType,
    brand: resolved.brand,
    category: resolved.category,
    presetKey: resolved.key,
    unit: resolved.unit,
    width: resolved.width,
    height: resolved.height,
    marginTop: resolved.marginTop,
    marginRight: resolved.marginRight,
    marginBottom: resolved.marginBottom,
    marginLeft: resolved.marginLeft,
    gapX: resolved.gapX,
    gapY: resolved.gapY,
    columns: resolved.columns,
    rows: resolved.rows,
    pageWidth: resolved.pageWidth,
    pageHeight: resolved.pageHeight,
    pageSize: resolved.pageSize,
  };
};

export function getLabelCategories(formatType?: LabelFormatType): LabelCategory[] {
  if (!formatType || formatType === 'custom') return [...LABEL_CATEGORIES];
  const unique = new Set(
    FEATURE_LABEL_PRESETS
      .filter((preset) => preset.formatType === formatType)
      .map((preset) => preset.category)
  );
  return LABEL_CATEGORIES.filter((category) => unique.has(category));
}

export function getLabelPresets(formatType?: LabelFormatType): LabelPreset[] {
  if (!formatType || formatType === 'custom') return [...FEATURE_LABEL_PRESETS];
  return FEATURE_LABEL_PRESETS.filter((preset) => preset.formatType === formatType);
}

export function getLabelBrands(formatType?: LabelFormatType): LabelBrand[] {
  if (!formatType) return [...LABEL_BRANDS];
  if (formatType === 'custom') return ['Custom'];
  const brands = new Set(
    getLabelPresets(formatType)
      .map((preset) => preset.brand)
      .filter((brand) => brand !== 'Custom')
  );
  return LABEL_BRANDS.filter((brand) => brand === 'Custom' || brands.has(brand));
}

export function getLabelPreset(
  formatType: LabelFormatType,
  brand: string,
  presetKey: string,
  category?: string,
): LabelPreset | null {
  if (formatType === 'custom') return null;
  const normalizedBrand = String(brand || '').trim().toLowerCase();
  const normalizedKey = String(presetKey || '').trim().toLowerCase();
  const normalizedCategory = String(category || '').trim().toLowerCase();

  const pool = getLabelPresets(formatType);
  const byKey = pool.find((preset) => preset.key.toLowerCase() === normalizedKey);
  if (byKey) return byKey;

  const byBrandCategory = pool.find((preset) =>
    preset.brand.toLowerCase() === normalizedBrand &&
    (!normalizedCategory || preset.category.toLowerCase() === normalizedCategory)
  );
  if (byBrandCategory) return byBrandCategory;

  const byBrand = pool.find((preset) => preset.brand.toLowerCase() === normalizedBrand);
  if (byBrand) return byBrand;

  return pool[0] || null;
}

export function normalizePdfLabelSettings(raw: unknown): PdfLabelSettings {
  const defaults = buildDefaultSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const candidate = raw as Partial<PdfLabelSettings>;
  const formatType = normalizeFormatType(candidate.formatType ?? defaults.formatType);

  if (formatType === 'custom') {
    const unit = normalizeUnit(candidate.unit || defaults.unit);
    return {
      formatType,
      brand: normalizeBrand(candidate.brand || 'Custom'),
      category: normalizeCategory(candidate.category || defaults.category),
      presetKey: 'custom',
      unit,
      width: clampNumber(candidate.width, defaults.width, { min: 0.01, max: 1000 }),
      height: clampNumber(candidate.height, defaults.height, { min: 0.01, max: 1000 }),
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      gapX: 0,
      gapY: 0,
      columns: 1,
      rows: 1,
      pageWidth: clampNumber(candidate.width, defaults.width, { min: 0.01, max: 1000 }),
      pageHeight: clampNumber(candidate.height, defaults.height, { min: 0.01, max: 1000 }),
      pageSize: 'CUSTOM',
    };
  }

  const preferredBrand = normalizeBrand(candidate.brand || defaults.brand);
  const preferredCategory = normalizeCategory(candidate.category || defaults.category);
  const preferredPresetKey = String(candidate.presetKey || defaults.presetKey);
  const resolvedPreset = getLabelPreset(formatType, preferredBrand, preferredPresetKey, preferredCategory) || getLabelPreset('thermal', 'Zebra', DEFAULT_LABEL_PRESET_ID);

  if (!resolvedPreset) return defaults;

  return {
    formatType,
    brand: resolvedPreset.brand,
    category: resolvedPreset.category,
    presetKey: resolvedPreset.key,
    unit: resolvedPreset.unit,
    width: resolvedPreset.width,
    height: resolvedPreset.height,
    marginTop: resolvedPreset.marginTop,
    marginRight: resolvedPreset.marginRight,
    marginBottom: resolvedPreset.marginBottom,
    marginLeft: resolvedPreset.marginLeft,
    gapX: resolvedPreset.gapX,
    gapY: resolvedPreset.gapY,
    columns: resolvedPreset.columns,
    rows: resolvedPreset.rows,
    pageWidth: resolvedPreset.pageWidth,
    pageHeight: resolvedPreset.pageHeight,
    pageSize: resolvedPreset.pageSize,
  };
}

export function resolvePdfLabelLayout(raw: unknown): ResolvedPdfLabelLayout {
  const settings = normalizePdfLabelSettings(raw);

  if (settings.formatType === 'custom') {
    const widthMm = toMillimeters(settings.width, settings.unit);
    const heightMm = toMillimeters(settings.height, settings.unit);
    return {
      mode: 'thermal',
      pageWidthMm: widthMm,
      pageHeightMm: heightMm,
      labelWidthMm: widthMm,
      labelHeightMm: heightMm,
      marginTopMm: 0,
      marginRightMm: 0,
      marginBottomMm: 0,
      marginLeftMm: 0,
      gapXmm: 0,
      gapYmm: 0,
      columns: 1,
      rows: 1,
    };
  }

  if (settings.formatType === 'thermal') {
    const widthMm = toMillimeters(settings.width, settings.unit);
    const heightMm = toMillimeters(settings.height, settings.unit);
    return {
      mode: 'thermal',
      pageWidthMm: widthMm,
      pageHeightMm: heightMm,
      labelWidthMm: widthMm,
      labelHeightMm: heightMm,
      marginTopMm: 0,
      marginRightMm: 0,
      marginBottomMm: 0,
      marginLeftMm: 0,
      gapXmm: 0,
      gapYmm: 0,
      columns: 1,
      rows: 1,
    };
  }

  const widthMm = toMillimeters(settings.width, settings.unit);
  const heightMm = toMillimeters(settings.height, settings.unit);
  const pageWidthMm = toMillimeters(settings.pageWidth, settings.unit);
  const pageHeightMm = toMillimeters(settings.pageHeight, settings.unit);
  const horizontalGap = settings.columns > 1
    ? Math.max(0, (pageWidthMm - (settings.columns * widthMm)) / (settings.columns + 1))
    : Math.max(0, (pageWidthMm - widthMm) / 2);
  const verticalGap = settings.rows > 1
    ? Math.max(0, (pageHeightMm - (settings.rows * heightMm)) / (settings.rows + 1))
    : Math.max(0, (pageHeightMm - heightMm) / 2);

  return {
    mode: 'sheet',
    pageWidthMm,
    pageHeightMm,
    labelWidthMm: widthMm,
    labelHeightMm: heightMm,
    marginTopMm: verticalGap,
    marginRightMm: horizontalGap,
    marginBottomMm: verticalGap,
    marginLeftMm: horizontalGap,
    gapXmm: horizontalGap,
    gapYmm: verticalGap,
    columns: settings.columns,
    rows: settings.rows,
  };
}

export function getLabelSlotsPerPage(layout: ResolvedPdfLabelLayout): number {
  if (!layout || layout.mode !== 'sheet') return 1;
  return Math.max(1, layout.columns * layout.rows);
}

export function validatePdfLabelLayout(raw: unknown): LabelValidationResult {
  const settings = normalizePdfLabelSettings(raw);
  const layout = resolvePdfLabelLayout(settings);
  const warnings: string[] = [];

  if (layout.labelWidthMm <= 0) warnings.push('Width must be greater than 0.');
  if (layout.labelHeightMm <= 0) warnings.push('Height must be greater than 0.');

  if (layout.mode === 'sheet') {
    if (layout.rows <= 0) warnings.push('Rows must be greater than 0 for sheet mode.');
    if (layout.columns <= 0) warnings.push('Columns must be greater than 0 for sheet mode.');

    const usedWidth =
      layout.marginLeftMm +
      layout.marginRightMm +
      (layout.columns * layout.labelWidthMm) +
      (Math.max(0, layout.columns - 1) * layout.gapXmm);
    const usedHeight =
      layout.marginTopMm +
      layout.marginBottomMm +
      (layout.rows * layout.labelHeightMm) +
      (Math.max(0, layout.rows - 1) * layout.gapYmm);

    if (usedWidth > layout.pageWidthMm + 0.001 || usedHeight > layout.pageHeightMm + 0.001) {
      warnings.push('Labels exceed page size.');
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

export {
  cmToPoints,
  generateSheetGrid,
  getPresetById,
  inchToPoints,
  mmToPoints,
  toMillimeters,
  validatePreset,
};
