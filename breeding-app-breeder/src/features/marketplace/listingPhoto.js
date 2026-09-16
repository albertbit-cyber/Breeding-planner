/**
 * Getting an animal's photo onto its marketplace card.
 *
 * A breeder's photos live on the device that took them, as base64 `data:` URIs
 * in the animal record, and they never reach the server: the snapshot sync
 * strips embedded media out of every payload on purpose, because the body-size
 * limit exists to protect the server rather than to store pictures. So the
 * marketplace has never had anything to show -- 327 animals, zero photos in the
 * database, and cards reading "No photo yet".
 *
 * The bridge is the marketplace's own upload endpoint, which already validates
 * by magic bytes, caps the size, and serves the bytes back at a public URL for
 * anyone looking at a published listing. This module prepares a photo for it.
 *
 * The decisions live here as pure functions so they can be tested; the one part
 * that needs a browser -- resizing through a canvas -- is isolated at the end.
 */

/** The upload endpoint rejects anything over 5 MB decoded. Leave headroom. */
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;
const MAX_EDGE = 1600;
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45];

export const isDataUri = (value) => typeof value === 'string' && value.trim().startsWith('data:');

const firstUrl = (entry) => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.url || entry.imageUrl || entry.dataUrl || entry.src || '';
};

/**
 * The picture the card should lead with: whatever the animal card itself shows.
 * `imageUrl` is the chosen cover; otherwise the most recent photo, which is what
 * the breeder app treats as current elsewhere.
 */
export function resolveCoverPhoto(snake) {
  const explicit = firstUrl(snake?.imageUrl);
  if (explicit) return explicit;
  const photos = Array.isArray(snake?.photos) ? snake.photos : [];
  for (let i = photos.length - 1; i >= 0; i -= 1) {
    const url = firstUrl(photos[i]);
    if (url) return url;
  }
  return '';
}

/**
 * Cheap identity for a photo, so re-saving an animal does not re-upload a
 * picture the listing already carries. A full hash of several megabytes of
 * base64 on every save would cost more than the request it saves.
 */
export function photoFingerprint(value) {
  const text = String(value || '');
  if (!text) return '';
  return `${text.length}:${text.slice(0, 32)}:${text.slice(-32)}`;
}

/**
 * What to do with this animal's cover photo, given what the listing already has.
 * Returns the action rather than performing it, so the caller stays readable and
 * this stays testable.
 */
export function planPhotoUpload(snake) {
  const cover = resolveCoverPhoto(snake);
  if (!cover) return { action: 'none' };

  // Already somewhere the marketplace can reach: hand the address over as it is.
  if (!isDataUri(cover)) return { action: 'link', imageUrl: cover };

  const fingerprint = photoFingerprint(cover);
  if (snake?.marketplaceImageUrl && snake?.marketplaceImageFingerprint === fingerprint) {
    return { action: 'reuse', imageUrl: snake.marketplaceImageUrl, fingerprint };
  }
  return { action: 'upload', dataUri: cover, fingerprint };
}

/** Splits a data URI into the parts the upload endpoint asks for. */
export function splitDataUri(dataUri) {
  const text = String(dataUri || '');
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(text);
  if (!match) return null;
  const mimeType = (match[1] || 'image/jpeg').trim();
  const base64 = match[2] ? match[3] : '';
  if (!base64) return null;
  return { mimeType, dataBase64: base64 };
}

/** Decoded size of a base64 payload, without decoding it. */
export function base64Bytes(base64) {
  const text = String(base64 || '');
  if (!text) return 0;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

export function extensionFor(mimeType) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[String(mimeType || '').toLowerCase()] || 'jpg';
}

/**
 * A photo straight off a phone is routinely several times the upload limit, and
 * the marketplace card shows it a few hundred pixels wide. Shrink until it fits
 * rather than refusing a picture the breeder can see perfectly well.
 *
 * Needs a browser. Returns the original untouched where there is no canvas, so
 * the caller can still decide to send it and get a readable error from the
 * server instead of a silent failure here.
 */
export async function shrinkToFit(dataUri, options = {}) {
  const maxBytes = options.maxBytes || MAX_UPLOAD_BYTES;
  const maxEdge = options.maxEdge || MAX_EDGE;

  const parts = splitDataUri(dataUri);
  if (!parts) return dataUri;
  if (base64Bytes(parts.dataBase64) <= maxBytes && parts.mimeType !== 'image/png') return dataUri;

  if (typeof document === 'undefined' || typeof Image === 'undefined') return dataUri;

  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('The photo could not be read.'));
    element.src = dataUri;
  });

  const scale = Math.min(1, maxEdge / Math.max(image.width || 1, image.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.height || 1) * scale));
  const context = canvas.getContext('2d');
  if (!context) return dataUri;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let best = dataUri;
  for (const quality of QUALITY_STEPS) {
    const candidate = canvas.toDataURL('image/jpeg', quality);
    const candidateParts = splitDataUri(candidate);
    if (!candidateParts) break;
    best = candidate;
    if (base64Bytes(candidateParts.dataBase64) <= maxBytes) return candidate;
  }
  return best;
}
