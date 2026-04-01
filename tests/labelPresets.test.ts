import { describe, expect, it } from 'vitest';
import {
  cmToPoints,
  generateSheetGrid,
  getLabelPreset,
  getPresetById,
  inchToPoints,
  mmToPoints,
  normalizePdfLabelSettings,
  resolvePdfLabelLayout,
  toMillimeters,
  validatePreset,
  validatePdfLabelLayout,
} from '../src/features/labels/presets';

describe('label presets', () => {
  it('resolves thermal preset by format, brand, and key', () => {
    const preset = getLabelPreset('thermal', 'DYMO', 'dymo-62x100');
    expect(preset).toBeTruthy();
    expect(preset?.formatType).toBe('thermal');
    expect(preset?.brand).toBe('DYMO');
  });

  it('normalizes preset-backed settings to canonical preset dimensions', () => {
    const normalized = normalizePdfLabelSettings({
      formatType: 'sheet',
      brand: 'Avery',
      category: 'Address',
      presetKey: 'avery-a4-99_1x38_1',
      width: 999,
      height: 999,
    });

    expect(normalized.formatType).toBe('sheet');
    expect(normalized.width).toBe(99.1);
    expect(normalized.height).toBe(38.1);
  });

  it('converts inches to millimeters for resolved layout', () => {
    const mm = toMillimeters(2, 'in');
    expect(mm).toBeCloseTo(50.8, 3);

    const layout = resolvePdfLabelLayout({
      formatType: 'custom',
      unit: 'in',
      width: 2,
      height: 1,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      gapX: 0,
      gapY: 0,
      columns: 1,
      rows: 1,
      pageWidth: 2,
      pageHeight: 1,
    });
    expect(layout.labelWidthMm).toBeCloseTo(50.8, 2);
    expect(layout.labelHeightMm).toBeCloseTo(25.4, 2);
  });

  it('flags overflow when sheet layout exceeds page bounds', () => {
    const result = validatePdfLabelLayout({
      formatType: 'sheet',
      brand: 'Avery',
      category: 'Archive',
      presetKey: 'avery-a4-38_1x12_7',
    });

    expect(result.isValid).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/exceed page size/i);
  });

  it('provides required conversion and lookup helpers', () => {
    expect(mmToPoints(25.4)).toBeCloseTo(72, 6);
    expect(cmToPoints(2.54)).toBeCloseTo(72, 6);
    expect(inchToPoints(1)).toBeCloseTo(72, 6);

    const preset = getPresetById('avery-a4-99_1x38_1');
    expect(preset).toBeTruthy();
  });

  it('generates a sheet grid and validates presets', () => {
    const preset = getPresetById('avery-a4-99_1x38_1');
    expect(preset).toBeTruthy();
    const grid = generateSheetGrid(preset!);
    expect(grid.length).toBe(14);

    const validation = validatePreset(preset!);
    expect(validation.isValid).toBe(true);
  });
});
