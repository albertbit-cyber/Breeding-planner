// Photo references: what an animal record holds once its photo is in cloud storage.
//
// A photo used to live in the record itself, as a base64 `data:` URL, and cloud sync stripped it
// before every upload, so the only copy was on the device that took it. Losing that device's
// storage lost the photos (72 of them on 13 Oct). Now the bytes go to the keeper's own folder in
// cloud storage and the record holds `photo:{photoId}`: a short string that syncs like a name,
// so every device signed in to the account sees the photo.
//
// Everything here is pure, so the sync and backup rules can be tested without a browser.
//
//   photo entry before:  { id: 'photo-…', url: 'data:image/jpeg;base64,…', name, addedAt, … }
//   photo entry after:   { id: 'photo-…', url: 'photo:abc123', photoId: 'abc123', name, addedAt, … }
//   cover before/after:  imageUrl: 'data:…'  ->  imageUrl: 'photo:abc123'

export const PHOTO_REF_PREFIX = 'photo:';

export const isPhotoRef = (value) => typeof value === 'string' && value.startsWith(PHOTO_REF_PREFIX) && value.length > PHOTO_REF_PREFIX.length;

export const photoIdFromRef = (value) => (isPhotoRef(value) ? value.slice(PHOTO_REF_PREFIX.length).trim() : '');

export const toPhotoRef = (photoId) => `${PHOTO_REF_PREFIX}${photoId}`;

export const isInlinePhoto = (value) => typeof value === 'string' && /^data:image\//i.test(value.trim());

/**
 * Every on-device photo still waiting to go to cloud storage, one entry per distinct picture.
 * This is the upload queue: derived from the records rather than kept beside them, so it can never
 * disagree with what the animal actually shows, and a photo restored from a backup file or taken
 * offline joins it simply by being there. The first pass over an existing collection is the
 * one-time migration of every photo ever taken.
 */
export function collectPendingPhotoUploads(snakes = []) {
  const byUrl = new Map();
  (Array.isArray(snakes) ? snakes : []).forEach((snake) => {
    if (!snake || typeof snake !== 'object' || snake.isDemo) return;
    const photos = Array.isArray(snake.photos) ? snake.photos : [];
    photos.forEach((photo) => {
      if (!isInlinePhoto(photo?.url) || byUrl.has(photo.url)) return;
      byUrl.set(photo.url, { snakeId: String(snake.id || ''), dataUrl: photo.url, kind: 'gallery' });
    });
    // A cover that is not one of the gallery photos (older records) still deserves its upload.
    if (isInlinePhoto(snake.imageUrl) && !byUrl.has(snake.imageUrl)) {
      byUrl.set(snake.imageUrl, { snakeId: String(snake.id || ''), dataUrl: snake.imageUrl, kind: 'cover' });
    }
  });
  return [...byUrl.values()];
}

/**
 * Swaps uploaded photos from their inline data to their reference. `swaps` maps a data URL to the
 * stored photo's id. The entry keeps its own id, so the sync merge sees one edited entry rather
 * than a removed one and an added one (a removal would be recorded and handed to every device).
 * Returns the same array when nothing changed, which lets a state setter skip the render.
 */
export function applyPhotoSwaps(snakes = [], swaps = new Map()) {
  if (!swaps || !swaps.size || !Array.isArray(snakes)) return snakes;
  let changedAny = false;
  const next = snakes.map((snake) => {
    if (!snake || typeof snake !== 'object') return snake;
    let changed = false;
    const photos = Array.isArray(snake.photos)
      ? snake.photos.map((photo) => {
        const photoId = photo && swaps.get(photo.url);
        if (!photoId) return photo;
        changed = true;
        return { ...photo, url: toPhotoRef(photoId), photoId };
      })
      : snake.photos;
    const coverId = swaps.get(snake.imageUrl);
    if (!changed && !coverId) return snake;
    changedAny = true;
    const result = { ...snake, photos };
    if (coverId) result.imageUrl = toPhotoRef(coverId);
    return result;
  });
  return changedAny ? next : snakes;
}

/** Every photo id the records point at. */
export function collectPhotoRefIds(snakes = []) {
  const ids = new Set();
  (Array.isArray(snakes) ? snakes : []).forEach((snake) => {
    if (!snake || typeof snake !== 'object') return;
    const add = (value) => {
      const id = photoIdFromRef(value);
      if (id) ids.add(id);
    };
    add(snake.imageUrl);
    (Array.isArray(snake.photos) ? snake.photos : []).forEach((photo) => add(photo?.url));
  });
  return ids;
}

/**
 * Backup files stay complete without the cloud: a reference is written out as the photo's bytes,
 * with `photoId` kept beside them so the backup still says which stored photo it was. Restoring
 * such a file puts the inline photo back on the device, and the upload queue then finds the same
 * stored photo again by its checksum instead of storing a second copy.
 *
 * `resolveDataUrl(photoId)` returns the bytes as a data URL, or null when they cannot be had
 * (offline and never seen on this device); such a photo stays a reference in the file.
 */
export async function inlinePhotoRefsForBackup(payload, resolveDataUrl) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.snakes)) return payload;
  const ids = collectPhotoRefIds(payload.snakes);
  if (!ids.size || typeof resolveDataUrl !== 'function') return payload;
  const bytes = new Map();
  for (const id of ids) {
    try {
      const dataUrl = await resolveDataUrl(id);
      if (isInlinePhoto(dataUrl)) bytes.set(id, dataUrl);
    } catch {
      // Left as a reference; the next backup tries again.
    }
  }
  if (!bytes.size) return payload;
  const inline = (value) => {
    const id = photoIdFromRef(value);
    return id && bytes.has(id) ? bytes.get(id) : value;
  };
  return {
    ...payload,
    snakes: payload.snakes.map((snake) => {
      if (!snake || typeof snake !== 'object') return snake;
      const photos = Array.isArray(snake.photos)
        ? snake.photos.map((photo) => {
          const id = photoIdFromRef(photo?.url);
          return id && bytes.has(id) ? { ...photo, url: bytes.get(id), photoId: id } : photo;
        })
        : snake.photos;
      return { ...snake, photos, imageUrl: inline(snake.imageUrl) };
    }),
  };
}
