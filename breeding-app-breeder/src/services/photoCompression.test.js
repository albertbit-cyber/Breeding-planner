import { beforeEach, describe, expect, it, vi } from 'vitest';

// The canvas pipeline needs a real browser, so the decode step is stubbed and this file tests the
// record-rewriting logic around it: what gets picked, what gets left alone, and whether the cover
// photo still points at a photo that exists.
vi.mock('../utils/imageResize', async () => {
  const actual = await vi.importActual('../utils/imageResize');
  return { ...actual, resizeDataUrl: vi.fn() };
});

import { PHOTO_PRESET, resizeDataUrl } from '../utils/imageResize';
import {
  compressStoredPhotos,
  estimateCompressionWork,
  formatByteSize,
  isCompressibleUrl,
  summarizeCompressionRun,
} from './photoCompression';

// Builds a data URL whose decoded payload is roughly `bytes` long.
const dataUrlOfSize = (bytes, tag = 'x') => {
  const body = Buffer.alloc(bytes, tag).toString('base64');
  return `data:image/jpeg;base64,${body}`;
};

const BIG_A = dataUrlOfSize(900 * 1024, 'a');
const BIG_B = dataUrlOfSize(700 * 1024, 'b');
const SMALL = dataUrlOfSize(20 * 1024, 's');

beforeEach(() => {
  vi.mocked(resizeDataUrl).mockReset();
  vi.mocked(resizeDataUrl).mockImplementation(async () => ({
    dataUrl: dataUrlOfSize(120 * 1024, 'z'),
    width: 1600,
    height: 1200,
    bytes: 120 * 1024,
    type: 'image/jpeg',
    originalBytes: 900 * 1024,
    resized: true,
  }));
});

describe('isCompressibleUrl', () => {
  it('accepts stored image data URLs', () => {
    expect(isCompressibleUrl('data:image/png;base64,AAAA')).toBe(true);
  });

  it('leaves remote and blob urls alone', () => {
    expect(isCompressibleUrl('https://cdn.example.com/a.jpg')).toBe(false);
    expect(isCompressibleUrl('blob:http://localhost/abc')).toBe(false);
    expect(isCompressibleUrl('data:application/pdf;base64,AAAA')).toBe(false);
    expect(isCompressibleUrl(undefined)).toBe(false);
  });
});

describe('estimateCompressionWork', () => {
  it('counts only photos over the budget, and each animal once', () => {
    const snakes = [
      { id: 'a', photos: [{ url: BIG_A }, { url: BIG_B }, { url: SMALL }] },
      { id: 'b', photos: [{ url: SMALL }] },
      { id: 'c', photos: [{ url: 'https://cdn.example.com/x.jpg' }] },
      { id: 'd' },
    ];
    const work = estimateCompressionWork(snakes, PHOTO_PRESET);
    expect(work.photos).toBe(2);
    expect(work.animals).toBe(1);
    expect(work.bytes).toBeGreaterThan(1_500_000);
  });

  it('reports no work for an empty account', () => {
    expect(estimateCompressionWork([], PHOTO_PRESET)).toEqual({ photos: 0, animals: 0, bytes: 0 });
    expect(estimateCompressionWork(null, PHOTO_PRESET).photos).toBe(0);
  });
});

describe('compressStoredPhotos', () => {
  it('rewrites oversized photos and records the saving', async () => {
    const snakes = [{ id: 'a', photos: [{ id: 'p1', url: BIG_A }] }];
    const { snakes: next, stats } = await compressStoredPhotos(snakes);

    expect(stats.processed).toBe(1);
    expect(stats.animalsChanged).toBe(1);
    expect(stats.bytesAfter).toBeLessThan(stats.bytesBefore);
    expect(next[0].photos[0].url).not.toBe(BIG_A);
    expect(next[0].photos[0].size).toBe(120 * 1024);
    expect(next[0].photos[0].id).toBe('p1');
  });

  it('keeps the cover photo pointing at the compressed copy', async () => {
    const snakes = [{ id: 'a', imageUrl: BIG_A, photos: [{ id: 'p1', url: BIG_A }] }];
    const { snakes: next } = await compressStoredPhotos(snakes);

    expect(next[0].imageUrl).toBe(next[0].photos[0].url);
    expect(next[0].imageUrl).not.toBe(BIG_A);
  });

  it('leaves a cover photo that is not one of the compressed photos untouched', async () => {
    const snakes = [{ id: 'a', imageUrl: SMALL, photos: [{ id: 'p1', url: BIG_A }] }];
    const { snakes: next } = await compressStoredPhotos(snakes);
    expect(next[0].imageUrl).toBe(SMALL);
  });

  it('skips photos already within budget without decoding them', async () => {
    const snakes = [{ id: 'a', photos: [{ id: 'p1', url: SMALL }] }];
    const { snakes: next, stats } = await compressStoredPhotos(snakes);

    expect(resizeDataUrl).not.toHaveBeenCalled();
    expect(stats.processed).toBe(0);
    expect(next[0]).toBe(snakes[0]);
  });

  it('keeps the original photo when a decode fails', async () => {
    vi.mocked(resizeDataUrl).mockRejectedValue(new Error('corrupt'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const snakes = [{ id: 'a', photos: [{ id: 'p1', url: BIG_A }] }];

    const { snakes: next, stats } = await compressStoredPhotos(snakes);

    expect(stats.failed).toBe(1);
    expect(stats.processed).toBe(0);
    expect(next[0].photos[0].url).toBe(BIG_A);
    warn.mockRestore();
  });

  it('keeps the original when the re-encode came out no smaller', async () => {
    vi.mocked(resizeDataUrl).mockResolvedValue({
      dataUrl: dataUrlOfSize(950 * 1024, 'z'),
      bytes: 950 * 1024,
      type: 'image/jpeg',
      resized: true,
    });
    const snakes = [{ id: 'a', photos: [{ id: 'p1', url: BIG_A }] }];
    const { snakes: next, stats } = await compressStoredPhotos(snakes);

    expect(stats.skipped).toBe(1);
    expect(next[0].photos[0].url).toBe(BIG_A);
  });

  it('reports progress once per decoded photo', async () => {
    const seen = [];
    const snakes = [{ id: 'a', photos: [{ url: BIG_A }, { url: BIG_B }, { url: SMALL }] }];
    await compressStoredPhotos(snakes, { onProgress: p => seen.push(p) });

    expect(seen).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
  });

  it('stops when cancelled and leaves the remaining photos alone', async () => {
    let calls = 0;
    const snakes = [{ id: 'a', photos: [{ url: BIG_A }, { url: BIG_B }] }];
    const { snakes: next, stats } = await compressStoredPhotos(snakes, {
      shouldCancel: () => {
        calls += 1;
        return calls > 1;
      },
    });

    expect(stats.cancelled).toBe(true);
    expect(stats.processed).toBe(1);
    expect(next[0].photos[1].url).toBe(BIG_B);
  });

  it('returns the input untouched when there is nothing to do', async () => {
    const snakes = [{ id: 'a', photos: [{ url: SMALL }] }];
    const { snakes: next, stats } = await compressStoredPhotos(snakes);
    expect(next).toBe(snakes);
    expect(stats.processed).toBe(0);
  });
});

describe('formatByteSize', () => {
  it('scales the unit to the value', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatByteSize(0)).toBe('0 B');
  });
});

describe('summarizeCompressionRun', () => {
  it('states what was saved', () => {
    const message = summarizeCompressionRun({
      processed: 12,
      animalsChanged: 3,
      failed: 0,
      bytesBefore: 10 * 1024 * 1024,
      bytesAfter: 1024 * 1024,
      cancelled: false,
    });
    expect(message).toContain('Compressed 12 photos');
    expect(message).toContain('3 animals');
    expect(message).toContain('90%');
  });

  it('mentions failures and early stops', () => {
    const message = summarizeCompressionRun({
      processed: 1,
      animalsChanged: 1,
      failed: 2,
      bytesBefore: 1000,
      bytesAfter: 500,
      cancelled: true,
    });
    expect(message).toContain('2 could not be read');
    expect(message).toContain('run it again');
  });

  it('says so when there was nothing to do', () => {
    expect(summarizeCompressionRun({ processed: 0, cancelled: false })).toContain('already within budget');
  });
});
