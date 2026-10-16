import { describe, expect, it, vi } from 'vitest';
import {
  applyPhotoSwaps,
  collectPendingPhotoUploads,
  collectPhotoRefIds,
  inlinePhotoRefsForBackup,
  isPhotoRef,
  photoIdFromRef,
  toPhotoRef,
} from './photoRefs';

const INLINE_A = 'data:image/jpeg;base64,/9j/AAAA';
const INLINE_B = 'data:image/jpeg;base64,/9j/BBBB';

const snake = (id, extra = {}) => ({ id, name: id, photos: [], ...extra });
const photo = (id, url) => ({ id, url, name: `${id}.jpg`, addedAt: '2026-08-24T04:09:51.788Z' });

describe('photo references', () => {
  it('names a stored photo', () => {
    expect(toPhotoRef('abc')).toBe('photo:abc');
    expect(isPhotoRef('photo:abc')).toBe(true);
    expect(isPhotoRef('photo:')).toBe(false);
    expect(isPhotoRef(INLINE_A)).toBe(false);
    expect(photoIdFromRef('photo:abc')).toBe('abc');
    expect(photoIdFromRef('https://cdn/p.jpg')).toBe('');
  });
});

describe('the upload queue', () => {
  it('holds each inline photo once, cover-only photos included, demos left out', () => {
    const snakes = [
      snake('a1', { photos: [photo('p1', INLINE_A)], imageUrl: INLINE_A }),
      // The same picture on a second animal is one upload.
      snake('a2', { photos: [photo('p2', INLINE_A)] }),
      // An older record whose cover is not in its gallery.
      snake('a3', { imageUrl: INLINE_B }),
      snake('a4', { photos: [photo('p4', 'photo:done')] }),
      snake('demo', { isDemo: true, photos: [photo('p5', 'data:image/png;base64,iVBOR')] }),
    ];
    expect(collectPendingPhotoUploads(snakes)).toEqual([
      { snakeId: 'a1', dataUrl: INLINE_A, kind: 'gallery', addedAt: '2026-08-24T04:09:51.788Z' },
      { snakeId: 'a3', dataUrl: INLINE_B, kind: 'cover', addedAt: null },
    ]);
  });

  it('is empty once everything is a reference', () => {
    expect(collectPendingPhotoUploads([snake('a1', { photos: [photo('p1', 'photo:x')], imageUrl: 'photo:x' })])).toEqual([]);
  });
});

describe('swapping uploaded photos to references', () => {
  it('keeps the entry id so the merge sees an edit, not a removal', () => {
    const before = [snake('a1', { photos: [photo('p1', INLINE_A), photo('p2', INLINE_B)], imageUrl: INLINE_A })];
    const after = applyPhotoSwaps(before, new Map([[INLINE_A, 'abc']]));
    expect(after[0].photos[0]).toEqual({ ...photo('p1', 'photo:abc'), photoId: 'abc' });
    // Not uploaded yet: unchanged, still showing from the device.
    expect(after[0].photos[1]).toEqual(photo('p2', INLINE_B));
    expect(after[0].imageUrl).toBe('photo:abc');
  });

  it('returns the same array when nothing changed', () => {
    const before = [snake('a1', { photos: [photo('p1', INLINE_A)] })];
    expect(applyPhotoSwaps(before, new Map([[INLINE_B, 'x']]))).toBe(before);
    expect(applyPhotoSwaps(before, new Map())).toBe(before);
  });

  it('lists every photo a record points at', () => {
    const ids = collectPhotoRefIds([
      snake('a1', { photos: [photo('p1', 'photo:one'), photo('p2', INLINE_A)], imageUrl: 'photo:cover' }),
    ]);
    expect([...ids].sort()).toEqual(['cover', 'one']);
  });
});

describe('backup files', () => {
  it('writes stored photos into the file as their bytes, keeping which photo they were', async () => {
    const payload = {
      version: 1,
      snakes: [snake('a1', { photos: [photo('p1', 'photo:abc')], imageUrl: 'photo:abc' })],
    };
    const resolve = vi.fn(async (id) => (id === 'abc' ? INLINE_A : null));
    const complete = await inlinePhotoRefsForBackup(payload, resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(complete.snakes[0].photos[0]).toMatchObject({ id: 'p1', url: INLINE_A, photoId: 'abc' });
    expect(complete.snakes[0].imageUrl).toBe(INLINE_A);
    // The live payload is not touched.
    expect(payload.snakes[0].imageUrl).toBe('photo:abc');
  });

  it('keeps a reference it cannot fetch rather than dropping the photo', async () => {
    const payload = { snakes: [snake('a1', { photos: [photo('p1', 'photo:offline')] })] };
    const complete = await inlinePhotoRefsForBackup(payload, async () => {
      throw new Error('offline');
    });
    expect(complete.snakes[0].photos[0].url).toBe('photo:offline');
  });

  it('leaves a file with no references exactly as it was', async () => {
    const payload = { snakes: [snake('a1', { photos: [photo('p1', INLINE_A)] })] };
    expect(await inlinePhotoRefsForBackup(payload, vi.fn())).toBe(payload);
  });
});
