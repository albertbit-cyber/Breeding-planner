export type LabelFormat = 'thermal' | 'sheet';
export type LabelUnit = 'mm' | 'cm' | 'in';
export type LabelPageSize = 'A4' | 'A5' | 'CUSTOM';

export type LabelBrand =
  | 'Zebra'
  | 'Brother'
  | 'DYMO'
  | 'Phomemo'
  | 'Avery'
  | 'HERMA'
  | 'TopStick'
  | 'Printation'
  | 'Custom';

export type LabelCategory =
  | 'Shipping'
  | 'Address'
  | 'Inventory'
  | 'Barcode'
  | 'File / Spine'
  | 'Archive'
  | 'Round'
  | 'Square'
  | 'Rectangle'
  | 'Full Sheet';

export interface LabelPreset {
  id: string;
  brand: LabelBrand;
  format: LabelFormat;
  category: LabelCategory;
  displayName: string;
  width: number;
  height: number;
  rows: number;
  columns: number;
  pageSize: LabelPageSize;
  unit: LabelUnit;
}

export interface LabelValidationResult {
  isValid: boolean;
  warnings: string[];
}

export interface SheetGridSlot {
  row: number;
  column: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

const A4 = { width: 210, height: 297 };
const A5 = { width: 148, height: 210 };

export const LABEL_BRANDS: LabelBrand[] = [
  'Zebra',
  'Brother',
  'DYMO',
  'Phomemo',
  'Avery',
  'HERMA',
  'TopStick',
  'Printation',
  'Custom',
];

export const LABEL_CATEGORIES: LabelCategory[] = [
  'Shipping',
  'Address',
  'Inventory',
  'Barcode',
  'File / Spine',
  'Archive',
  'Round',
  'Square',
  'Rectangle',
  'Full Sheet',
];

const thermalPreset = (
  brand: Exclude<LabelBrand, 'Custom'>,
  width: number,
  height: number,
  category: LabelCategory,
): LabelPreset => {
  const widthToken = String(width).replace('.', '_');
  const heightToken = String(height).replace('.', '_');
  return {
    id: `${brand.toLowerCase()}-${widthToken}x${heightToken}`,
    brand,
    format: 'thermal',
    category,
    displayName: `${brand} ${width} × ${height} mm`,
    width,
    height,
    rows: 1,
    columns: 1,
    pageSize: 'CUSTOM',
    unit: 'mm',
  };
};

const sheetPreset = (
  brand: Exclude<LabelBrand, 'Custom'>,
  width: number,
  height: number,
  rows: number,
  columns: number,
  category: LabelCategory,
  pageSize: LabelPageSize = 'A4',
): LabelPreset => {
  const widthToken = String(width).replace('.', '_');
  const heightToken = String(height).replace('.', '_');
  const total = rows * columns;
  return {
    id: `${brand.toLowerCase()}-${pageSize.toLowerCase()}-${widthToken}x${heightToken}`,
    brand,
    format: 'sheet',
    category,
    displayName: `${brand} ${width} × ${height} mm (${total} per ${pageSize})`,
    width,
    height,
    rows,
    columns,
    pageSize,
    unit: 'mm',
  };
};

const zebraThermalSizes: Array<[number, number, LabelCategory]> = [
  [50, 25, 'Barcode'],
  [50, 30, 'Inventory'],
  [50, 50, 'Square'],
  [60, 40, 'Address'],
  [70, 50, 'Inventory'],
  [100, 50, 'Shipping'],
  [100, 75, 'Shipping'],
  [101.6, 76.2, 'Shipping'],
  [101.6, 152.4, 'Shipping'],
];

const brotherDymoSizes: Array<[number, number, LabelCategory]> = [
  [62, 29, 'Address'],
  [62, 100, 'Shipping'],
  [89, 28, 'File / Spine'],
  [102, 59, 'Shipping'],
  [102, 152, 'Shipping'],
];

const phomemoSizes: Array<[number, number, LabelCategory]> = [
  [14, 40, 'File / Spine'],
  [14, 50, 'File / Spine'],
  [14, 60, 'File / Spine'],
  [15, 30, 'File / Spine'],
  [15, 40, 'File / Spine'],
  [15, 50, 'File / Spine'],
  [20, 10, 'Barcode'],
  [20, 20, 'Square'],
  [20, 30, 'Barcode'],
  [20, 40, 'Inventory'],
  [20, 50, 'Inventory'],
  [20, 60, 'Inventory'],
  [20, 100, 'File / Spine'],
  [25, 10, 'Barcode'],
  [25, 15, 'Barcode'],
  [25, 30, 'Inventory'],
  [25, 38, 'Inventory'],
  [25, 67, 'File / Spine'],
  [28, 89, 'File / Spine'],
  [30, 15, 'Barcode'],
  [30, 20, 'Barcode'],
  [30, 25, 'Barcode'],
  [30, 30, 'Square'],
  [30, 40, 'Inventory'],
  [35, 15, 'Barcode'],
  [40, 15, 'Barcode'],
  [40, 20, 'Barcode'],
  [40, 30, 'Inventory'],
  [40, 40, 'Square'],
  [40, 60, 'Inventory'],
  [40, 70, 'Inventory'],
  [40, 80, 'Inventory'],
  [45, 15, 'Barcode'],
  [45, 20, 'Barcode'],
  [45, 60, 'Inventory'],
  [45, 80, 'Inventory'],
  [50, 15, 'Barcode'],
  [50, 20, 'Barcode'],
  [50, 30, 'Inventory'],
  [50, 50, 'Square'],
  [50, 70, 'Inventory'],
  [50, 80, 'Inventory'],
  [57, 32, 'Address'],
  [60, 40, 'Address'],
  [60, 60, 'Square'],
  [60, 80, 'Inventory'],
  [60, 86, 'Inventory'],
  [62, 100, 'Shipping'],
  [70, 40, 'Address'],
  [70, 70, 'Square'],
  [70, 80, 'Inventory'],
  [76.2, 76.2, 'Square'],
  [80, 135, 'Shipping'],
  [87, 107, 'Shipping'],
  [89, 28, 'File / Spine'],
  [89, 133, 'Shipping'],
  [101.5, 76.2, 'Shipping'],
  [101.5, 152, 'Shipping'],
];

const a4SheetPresets: Array<[number, number, number, number, LabelCategory]> = [
  [210, 297, 1, 1, 'Full Sheet'],
  [210, 148, 2, 1, 'Shipping'],
  [202, 120, 2, 1, 'Shipping'],
  [202, 86, 3, 1, 'Shipping'],
  [199.6, 289.1, 1, 1, 'Inventory'],
  [199.6, 143.5, 2, 1, 'Inventory'],
  [192, 61, 4, 1, 'Address'],
  [192, 38, 7, 1, 'Address'],
  [105, 148, 2, 2, 'Shipping'],
  [105, 74, 4, 2, 'Inventory'],
  [105, 48, 6, 2, 'Inventory'],
  [105, 42.3, 7, 2, 'Address'],
  [105, 37, 8, 2, 'Address'],
  [105, 35, 8, 2, 'Address'],
  [105, 33.8, 8, 2, 'Address'],
  [99.1, 139, 2, 2, 'Address'],
  [99.1, 93.1, 3, 2, 'Address'],
  [99.1, 67.7, 4, 2, 'Address'],
  [99.1, 57, 5, 2, 'Address'],
  [99.1, 42.3, 6, 2, 'Address'],
  [99.1, 38.1, 7, 2, 'Address'],
  [99.1, 33.8, 8, 2, 'Address'],
  [70, 67.7, 4, 3, 'Archive'],
  [70, 50.8, 5, 3, 'Archive'],
  [70, 42.3, 7, 3, 'Archive'],
  [70, 37, 8, 3, 'Archive'],
  [70, 33.8, 8, 3, 'Archive'],
  [70, 29.7, 9, 3, 'Archive'],
  [63.5, 72, 4, 3, 'Inventory'],
  [63.5, 46.6, 6, 3, 'Inventory'],
  [63.5, 38.1, 7, 3, 'Inventory'],
  [52.5, 29.7, 10, 4, 'Barcode'],
  [52.5, 21.2, 14, 4, 'Barcode'],
  [48.5, 25.4, 11, 4, 'Barcode'],
  [48.5, 16.9, 16, 4, 'Barcode'],
  [46, 11.1, 21, 4, 'Barcode'],
  [38.1, 29.6, 12, 4, 'Archive'],
  [38.1, 21.2, 13, 5, 'Archive'],
  [38.1, 12.7, 27, 7, 'Archive'],
  [35.6, 16.9, 20, 5, 'Archive'],
  [30.5, 16.9, 24, 5, 'Archive'],
  [25.4, 10, 27, 7, 'Archive'],
];

const a5SheetPresets: Array<[number, number, number, number, LabelCategory]> = [
  [148, 210, 1, 1, 'Full Sheet'],
  [148, 105, 2, 1, 'Shipping'],
  [74, 105, 2, 2, 'Address'],
];

const thermalPresets: LabelPreset[] = [
  ...zebraThermalSizes.map(([w, h, category]) => thermalPreset('Zebra', w, h, category)),
  ...brotherDymoSizes.map(([w, h, category]) => thermalPreset('Brother', w, h, category)),
  ...brotherDymoSizes.map(([w, h, category]) => thermalPreset('DYMO', w, h, category)),
  ...phomemoSizes.map(([w, h, category]) => thermalPreset('Phomemo', w, h, category)),
];

const sheetBrandSet: Array<Exclude<LabelBrand, 'Custom'>> = ['Avery', 'HERMA', 'TopStick', 'Printation'];
const sheetPresets: LabelPreset[] = sheetBrandSet.flatMap((brand) => [
  ...a4SheetPresets.map(([w, h, rows, columns, category]) =>
    sheetPreset(brand, w, h, rows, columns, category, 'A4')
  ),
  ...a5SheetPresets.map(([w, h, rows, columns, category]) =>
    sheetPreset(brand, w, h, rows, columns, category, 'A5')
  ),
]);

export const LABEL_PRESETS: LabelPreset[] = [...thermalPresets, ...sheetPresets];

export const DEFAULT_LABEL_PRESET_ID = 'zebra-100x50';

export function inchToPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value * 72;
}

export function cmToPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return (value / 2.54) * 72;
}

export function mmToPoints(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return (value / 25.4) * 72;
}

export function getPresetById(id: string): LabelPreset | null {
  const token = String(id || '').trim().toLowerCase();
  if (!token) return null;
  return LABEL_PRESETS.find((preset) => preset.id.toLowerCase() === token) || null;
}

export function getPageSizeMm(pageSize: LabelPageSize): { width: number; height: number } {
  if (pageSize === 'A5') return { ...A5 };
  if (pageSize === 'A4') return { ...A4 };
  return { width: 0, height: 0 };
}

export function toMillimeters(value: number, unit: LabelUnit): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'cm') return value * 10;
  if (unit === 'in') return value * 25.4;
  return value;
}

export function generateSheetGrid(preset: LabelPreset): SheetGridSlot[] {
  const slots: SheetGridSlot[] = [];
  if (preset.format !== 'sheet') return slots;
  const page = getPageSizeMm(preset.pageSize);
  const widthMm = toMillimeters(preset.width, preset.unit);
  const heightMm = toMillimeters(preset.height, preset.unit);
  const horizontalGap = preset.columns > 1
    ? Math.max(0, (page.width - (preset.columns * widthMm)) / (preset.columns + 1))
    : Math.max(0, (page.width - widthMm) / 2);
  const verticalGap = preset.rows > 1
    ? Math.max(0, (page.height - (preset.rows * heightMm)) / (preset.rows + 1))
    : Math.max(0, (page.height - heightMm) / 2);

  for (let row = 0; row < preset.rows; row += 1) {
    for (let column = 0; column < preset.columns; column += 1) {
      slots.push({
        row,
        column,
        xMm: horizontalGap + column * (widthMm + horizontalGap),
        yMm: verticalGap + row * (heightMm + verticalGap),
        widthMm,
        heightMm,
      });
    }
  }

  return slots;
}

export function validatePreset(preset: LabelPreset): LabelValidationResult {
  const warnings: string[] = [];
  const widthMm = toMillimeters(preset.width, preset.unit);
  const heightMm = toMillimeters(preset.height, preset.unit);

  if (widthMm <= 0) warnings.push('Width must be greater than 0.');
  if (heightMm <= 0) warnings.push('Height must be greater than 0.');

  if (preset.format === 'sheet') {
    if (preset.rows <= 0) warnings.push('Rows must be greater than 0 for sheet format.');
    if (preset.columns <= 0) warnings.push('Columns must be greater than 0 for sheet format.');

    const page = getPageSizeMm(preset.pageSize);
    if (page.width > 0 && page.height > 0) {
      const gridWidth = widthMm * preset.columns;
      const gridHeight = heightMm * preset.rows;
      if (gridWidth > page.width + 0.001 || gridHeight > page.height + 0.001) {
        warnings.push('Labels exceed page size.');
      }
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}
