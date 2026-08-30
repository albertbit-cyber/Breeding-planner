// One-time backfill that shrinks photos stored before the resize engine existed.
//
// New uploads are compressed at capture time by utils/imageResize, but an account can already hold
// dozens of full-resolution phone photos per animal, each sitting in localStorage and in every
// cloud sync body as a base64 data URL. This walks those records once and rewrites them.
//
// Two things it must not get wrong:
//   * `snake.imageUrl` is the cover photo and holds a *copy* of one photo's url, not a reference.
//     Rewriting the photo without remapping the cover would blank the animal's picture.
//   * Compressing every animal marks every animal changed, so the next sync uploads the whole
//     account. That is a real cost and the caller warns about it before starting.

import { PHOTO_PRESET, estimateDataUrlBytes, resizeDataUrl } from '../utils/imageResize';

export const PHOTO_COMPRESSION_STORAGE_KEY = 'breedingPlannerPhotoCompressionV1';

// Only stored data URLs can be recompressed. A remote https:// photo is not ours to touch, and a
// blob: url does not survive a reload anyway.
export function isCompressibleUrl(url) {
  return typeof url === 'string' && /^data:image\//i.test(url);
}

// What the migration would do, without decoding anything. Drives the button's "about to process
// N photos" copy, so the user sees the scale before committing.
export function estimateCompressionWork(snakes, preset = PHOTO_PRESET) {
  let photos = 0;
  let animals = 0;
  let bytes = 0;
  (Array.isArray(snakes) ? snakes : []).forEach(snake => {
    const list = Array.isArray(snake?.photos) ? snake.photos : [];
    let animalCounted = false;
    list.forEach(photo => {
      if (!isCompressibleUrl(photo?.url)) return;
      const size = estimateDataUrlBytes(photo.url);
      // Anything already under budget will be skipped by the engine, so do not promise to shrink it.
      if (size <= preset.maxBytes) return;
      photos += 1;
      bytes += size;
      if (!animalCounted) {
        animals += 1;
        animalCounted = true;
      }
    });
  });
  return { photos, animals, bytes };
}

/**
 * Rewrites oversized stored photos in place.
 *
 * Runs one photo at a time on purpose: this is a background chore competing with the UI, and
 * decoding several full-resolution bitmaps at once is what makes a phone drop frames or die.
 *
 * A photo that fails to decode is left exactly as it was -- a corrupt or exotic image must never
 * cost the user their picture.
 *
 * @param {Array} snakes animal records to walk
 * @param {{preset?: object, onProgress?: (p: {done: number, total: number}) => void,
 *   shouldCancel?: () => boolean}} options
 * @returns {Promise<{snakes: Array, stats: {processed: number, skipped: number, failed: number,
 *   animalsChanged: number, bytesBefore: number, bytesAfter: number, cancelled: boolean}}>}
 */
export async function compressStoredPhotos(snakes, options = {}) {
  const preset = options.preset || PHOTO_PRESET;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : null;
  const list = Array.isArray(snakes) ? snakes : [];

  const total = estimateCompressionWork(list, preset).photos;
  const stats = {
    processed: 0,
    skipped: 0,
    failed: 0,
    animalsChanged: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    cancelled: false,
  };
  if (!total) return { snakes: list, stats };

  let done = 0;
  const nextSnakes = [];

  for (const snake of list) {
    const photos = Array.isArray(snake?.photos) ? snake.photos : null;
    if (!photos || !photos.length) {
      nextSnakes.push(snake);
      continue;
    }

    // Old url -> new url, so the cover photo can follow its picture afterwards.
    const remapped = new Map();
    let animalChanged = false;
    const nextPhotos = [];

    for (const photo of photos) {
      if (stats.cancelled) {
        nextPhotos.push(photo);
        continue;
      }
      if (!isCompressibleUrl(photo?.url)) {
        nextPhotos.push(photo);
        continue;
      }
      const before = estimateDataUrlBytes(photo.url);
      if (before <= preset.maxBytes) {
        nextPhotos.push(photo);
        stats.skipped += 1;
        continue;
      }
      if (shouldCancel && shouldCancel()) {
        stats.cancelled = true;
        nextPhotos.push(photo);
        continue;
      }

      try {
        const result = await resizeDataUrl(photo.url, preset);
        done += 1;
        if (onProgress) onProgress({ done, total });

        if (!result.resized || result.bytes >= before) {
          nextPhotos.push(photo);
          stats.skipped += 1;
          continue;
        }
        remapped.set(photo.url, result.dataUrl);
        stats.processed += 1;
        stats.bytesBefore += before;
        stats.bytesAfter += result.bytes;
        animalChanged = true;
        nextPhotos.push({
          ...photo,
          url: result.dataUrl,
          type: result.type || photo.type,
          size: result.bytes,
        });
      } catch (err) {
        done += 1;
        if (onProgress) onProgress({ done, total });
        console.warn('Could not compress a stored photo; leaving it unchanged', err);
        stats.failed += 1;
        nextPhotos.push(photo);
      }
    }

    if (!animalChanged) {
      nextSnakes.push(snake);
      continue;
    }
    stats.animalsChanged += 1;
    const nextImageUrl = remapped.get(snake.imageUrl) || snake.imageUrl;
    nextSnakes.push({ ...snake, photos: nextPhotos, imageUrl: nextImageUrl });
  }

  return { snakes: nextSnakes, stats };
}

// Human-readable byte count, matching the photo gallery's formatting.
export function formatByteSize(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

export function summarizeCompressionRun(stats) {
  if (!stats) return '';
  if (stats.cancelled && !stats.processed) return 'Compression cancelled. Nothing was changed.';
  if (!stats.processed) return 'Nothing to compress — every stored photo is already within budget.';
  const saved = Math.max(0, stats.bytesBefore - stats.bytesAfter);
  const percent = stats.bytesBefore > 0 ? Math.round((saved / stats.bytesBefore) * 100) : 0;
  const parts = [
    `Compressed ${stats.processed} photo${stats.processed === 1 ? '' : 's'}`,
    `across ${stats.animalsChanged} animal${stats.animalsChanged === 1 ? '' : 's'}`,
    `— saved ${formatByteSize(saved)} (${percent}%).`,
  ];
  if (stats.failed) parts.push(`${stats.failed} could not be read and were left unchanged.`);
  if (stats.cancelled) parts.push('Stopped early; run it again to finish.');
  return parts.join(' ');
}
