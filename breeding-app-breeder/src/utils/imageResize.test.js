import { describe, expect, it } from 'vitest';
import {
  PHOTO_PRESET,
  LOGO_PRESET,
  buildEncodeLadder,
  computeTargetDimensions,
  estimateDataUrlBytes,
  mapWithConcurrency,
  pickOutputType,
  shouldSkipResize,
} from './imageResize';

// Only the pure helpers are covered here; the canvas pipeline needs a real browser and is
// verified by hand (a 4000x3000 phone JPEG must come out <= 400 KB and correctly oriented).

describe('computeTargetDimensions', () => {
  it('fits a landscape photo inside the cap and keeps the aspect ratio', () => {
    expect(computeTargetDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('caps the long edge on portrait photos too', () => {
    expect(computeTargetDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never upscales a small image', () => {
    expect(computeTargetDimensions(400, 300, 1600)).toEqual({ width: 400, height: 300 });
  });

  it('keeps an extreme panorama at least one pixel tall', () => {
    expect(computeTargetDimensions(8000, 20, 1600)).toEqual({ width: 1600, height: 4 });
    expect(computeTargetDimensions(8000, 1, 1600).height).toBe(1);
  });

  it('returns zeroes for unusable dimensions rather than NaN', () => {
    expect(computeTargetDimensions(0, 500, 1600)).toEqual({ width: 0, height: 0 });
    expect(computeTargetDimensions(undefined, undefined, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe('estimateDataUrlBytes', () => {
  it('measures the decoded payload, not the string length', () => {
    // "hello world" is 11 bytes and encodes to 16 base64 characters.
    const dataUrl = `data:image/jpeg;base64,${Buffer.from('hello world').toString('base64')}`;
    expect(estimateDataUrlBytes(dataUrl)).toBe(11);
  });

  it('accounts for single and double padding', () => {
    expect(estimateDataUrlBytes(`data:x;base64,${Buffer.from('ab').toString('base64')}`)).toBe(2);
    expect(estimateDataUrlBytes(`data:x;base64,${Buffer.from('a').toString('base64')}`)).toBe(1);
    expect(estimateDataUrlBytes(`data:x;base64,${Buffer.from('abc').toString('base64')}`)).toBe(3);
  });

  it('handles non-base64 and malformed input', () => {
    expect(estimateDataUrlBytes('data:image/svg+xml,abcd')).toBe(4);
    expect(estimateDataUrlBytes('not-a-data-url')).toBe(0);
    expect(estimateDataUrlBytes(null)).toBe(0);
  });
});

describe('shouldSkipResize', () => {
  it('skips an image already inside both budgets', () => {
    expect(shouldSkipResize({ width: 800, height: 600, bytes: 90_000 }, PHOTO_PRESET)).toBe(true);
  });

  it('resizes when the dimensions are too large even if the file is small', () => {
    expect(shouldSkipResize({ width: 4000, height: 3000, bytes: 1000 }, PHOTO_PRESET)).toBe(false);
  });

  it('resizes when the file is too heavy even at modest dimensions', () => {
    expect(shouldSkipResize({ width: 900, height: 900, bytes: 2_000_000 }, PHOTO_PRESET)).toBe(false);
  });

  it('treats an image exactly on the limits as already fine', () => {
    expect(shouldSkipResize({ width: 1600, height: 900, bytes: PHOTO_PRESET.maxBytes }, PHOTO_PRESET)).toBe(true);
  });
});

describe('pickOutputType', () => {
  it('keeps PNG for a transparent logo so it is not flattened onto black', () => {
    expect(pickOutputType(LOGO_PRESET, true)).toBe('image/png');
  });

  it('uses JPEG for an opaque logo', () => {
    expect(pickOutputType(LOGO_PRESET, false)).toBe('image/jpeg');
  });

  it('ignores alpha for presets that do not preserve it', () => {
    expect(pickOutputType(PHOTO_PRESET, true)).toBe('image/jpeg');
  });

  it('never emits WebP, which jsPDF cannot decode in catalog exports', () => {
    [PHOTO_PRESET, LOGO_PRESET].forEach(preset => {
      expect(pickOutputType(preset, true)).not.toBe('image/webp');
      expect(pickOutputType(preset, false)).not.toBe('image/webp');
    });
  });
});

describe('buildEncodeLadder', () => {
  it('walks the quality steps for JPEG at full size', () => {
    expect(buildEncodeLadder(PHOTO_PRESET, 'image/jpeg')).toEqual([
      { scale: 1, quality: 0.82 },
      { scale: 1, quality: 0.7 },
      { scale: 1, quality: 0.6 },
    ]);
  });

  it('walks the dimensions for PNG, which has no quality knob', () => {
    const ladder = buildEncodeLadder(LOGO_PRESET, 'image/png');
    expect(ladder.map(step => step.scale)).toEqual([1, 0.75, 0.5]);
    expect(ladder.every(step => step.quality === undefined)).toBe(true);
  });

  it('falls back to a single attempt when a preset defines no steps', () => {
    expect(buildEncodeLadder({}, 'image/jpeg')).toEqual([{ scale: 1, quality: 0.82 }]);
  });
});

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => value * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  it('never runs more than the limit at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight -= 1;
    });
    expect(peak).toBe(2);
  });

  it('handles an empty list without hanging', async () => {
    expect(await mapWithConcurrency([], 2, async () => 1)).toEqual([]);
  });
});
