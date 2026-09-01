import { describe, expect, it } from 'vitest';
import {
  CATALOG_METRICS,
  catalogBirthValue,
  catalogPhotoBox,
  catalogSexWord,
  fitImageInBox,
  fitTextToBox,
  pt2mm,
} from './catalogLayout';

// Stands in for jsPDF's splitTextToSize: a fixed character width per point,
// wrapped on whole words, so line counts respond to size the way real text does.
const makeMeasure = (columnMm, perPt = 0.5) => (text, size) => {
  const charMm = size * perPt * 0.352778;
  const maxChars = Math.max(1, Math.floor(columnMm / charMm));
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) { line = candidate; continue; }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
};

describe('fitTextToBox', () => {
  const measure = makeMeasure(67.7);

  it('keeps the largest size when the text already fits', () => {
    const fitted = fitTextToBox({
      text: 'Lulu', measure, startSize: 18, minSize: 8, maxLines: 3,
    });
    expect(fitted.size).toBe(18);
    expect(fitted.lines).toEqual(['Lulu']);
  });

  it('steps down until a long name fits the line budget', () => {
    const long = 'Nagini x Bartholomew - 14 Super Pastel Clown het Piebald';

    // Three lines is enough room for this name at full size.
    const roomy = fitTextToBox({ text: long, measure, startSize: 18, minSize: 8, maxLines: 3 });
    expect(roomy.size).toBe(18);
    expect(roomy.lines.length).toBeLessThanOrEqual(3);

    // Two is not, so the type gives way rather than the name.
    const tight = fitTextToBox({ text: long, measure, startSize: 18, minSize: 8, maxLines: 2 });
    expect(tight.size).toBeLessThan(18);
    expect(tight.lines.length).toBeLessThanOrEqual(2);
    expect(tight.lines.join(' ')).toBe(long);
  });

  it('never truncates: every word survives at the floor', () => {
    const absurd = Array.from({ length: 60 }, (_, i) => `Word${i}`).join(' ');
    const fitted = fitTextToBox({ text: absurd, measure, startSize: 18, minSize: 8, maxLines: 3 });
    expect(fitted.size).toBe(8);
    const rendered = fitted.lines.join(' ');
    expect(rendered).toBe(absurd);
    expect(rendered).not.toContain('…');
  });

  it('respects a height budget even when the line count would pass', () => {
    const text = 'Apollo x Nyx - 3 Pastel';
    const tight = fitTextToBox({
      text, measure, startSize: 18, minSize: 8, maxLines: 99, maxHeightMm: 6,
    });
    const height = tight.lines.length * pt2mm(tight.size * CATALOG_METRICS.lineFactor);
    expect(height).toBeLessThanOrEqual(6.01);
  });

  it('returns nothing to draw for empty text', () => {
    expect(fitTextToBox({ text: '   ', measure, startSize: 18, minSize: 8 }).lines).toEqual([]);
  });
});

describe('catalogSexWord', () => {
  it('spells out the breeder shorthand', () => {
    expect(catalogSexWord('M')).toBe('Male');
    expect(catalogSexWord('F')).toBe('Female');
  });

  it('treats not-yet-sexed as a real state rather than a blank', () => {
    expect(catalogSexWord('U')).toBe('Unsexed');
    expect(catalogSexWord(undefined)).toBe('Unsexed');
  });

  it('takes translated words when given them', () => {
    expect(catalogSexWord('F', { female: 'Weiblich' })).toBe('Weiblich');
  });
});

describe('catalogBirthValue', () => {
  it('prefers the recorded birth date', () => {
    expect(catalogBirthValue({ birthDate: '2026-06-14', year: '2026' })).toBe('2026-06-14');
  });

  it('falls back through hatch date to the year', () => {
    expect(catalogBirthValue({ hatchDate: '2026-06-14' })).toBe('2026-06-14');
    expect(catalogBirthValue({ metadata: { hatchDate: '2026-06-01' } })).toBe('2026-06-01');
    expect(catalogBirthValue({ year: '2026' })).toBe('2026');
  });

  it('returns empty when nothing was recorded', () => {
    expect(catalogBirthValue({})).toBe('');
    expect(catalogBirthValue(null)).toBe('');
  });
});

describe('catalogPhotoBox', () => {
  it('gives the photograph the full width across the top', () => {
    const box = catalogPhotoBox(210, 148);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.w).toBe(210);
    expect(box.h).toBeCloseTo(148 * CATALOG_METRICS.photoRatio, 5);
  });

  it('leaves enough band beneath for two parent blocks', () => {
    const box = catalogPhotoBox(210, 148);
    const usable = 148 - box.h - CATALOG_METRICS.bandPadTop - CATALOG_METRICS.bandPadBottom;
    // label + name + two genetics lines + gap, twice over
    const perParent = pt2mm(CATALOG_METRICS.labelPt * CATALOG_METRICS.lineFactor)
      + CATALOG_METRICS.labelGap
      + pt2mm(CATALOG_METRICS.parentNamePt * CATALOG_METRICS.lineFactor)
      + (2 * pt2mm(CATALOG_METRICS.parentGenPt * CATALOG_METRICS.lineFactor))
      + CATALOG_METRICS.fieldGap;
    expect(usable).toBeGreaterThan(perParent * 2);
  });
});

describe('fitImageInBox', () => {
  const box = { x: 0, y: 0, w: 210, h: 96.2 };

  it('never crops: the whole frame always fits inside the box', () => {
    for (const aspect of [0.5, 0.75, 1, 4 / 3, 16 / 9, 3]) {
      const fit = fitImageInBox(1000 * aspect, 1000, box);
      expect(fit.w).toBeLessThanOrEqual(box.w + 0.001);
      expect(fit.h).toBeLessThanOrEqual(box.h + 0.001);
      expect(fit.x).toBeGreaterThanOrEqual(-0.001);
      expect(fit.y).toBeGreaterThanOrEqual(-0.001);
      // aspect ratio survives the fit
      expect(fit.w / fit.h).toBeCloseTo(aspect, 4);
    }
  });

  it('centres the picture in whatever space is left', () => {
    const fit = fitImageInBox(1000, 1000, box);
    expect(fit.x).toBeCloseTo((box.w - fit.w) / 2, 5);
    expect(fit.h).toBeCloseTo(box.h, 5);
  });

  it('fills the width when the picture is wider than the box', () => {
    const fit = fitImageInBox(3000, 1000, box);
    expect(fit.w).toBeCloseTo(box.w, 5);
    expect(fit.y).toBeGreaterThan(0);
  });

  it('falls back to the whole box for an unmeasurable image', () => {
    expect(fitImageInBox(0, 0, box)).toEqual(box);
  });
});
