// Moving photos to cloud storage, and showing them from there.
//
// A photo is taken offline-first, exactly as before: it is shrunk on capture and stored inline in
// the animal record, so it shows at once with or without a connection. Signed in and online, the
// upload queue (photoRefs.collectPendingPhotoUploads) sends it to the keeper's folder in cloud
// storage and the record's value becomes `photo:{id}`. The device keeps its own copy of the bytes
// in a local cache, so the photo it took still shows offline; every other device asks the backend
// for a short-lived signed URL.
//
// Same code path in the browser and in the Android app: nothing here touches the native layer.

import {
  completeCloudPhoto,
  fetchCloudPhotoUrls,
  putPhotoBytes,
  requestPhotoUploadUrl,
  resolveBackendUrl,
  restoreCloudPhoto,
} from '../shared/apiClient';
import { readStoredJson, writeStoredJson } from '../platform/deviceStore';
import { PHOTO_PRESET, dataUrlToBlob, resizeImageBlob } from '../utils/imageResize';
import { collectPendingPhotoUploads, photoIdFromRef } from './photoRefs';

export const PHOTO_CACHE_STORAGE_KEY = 'serpentoraPhotoCache';

// What the backend accepts (it checks the bytes again on complete).
const UPLOADABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

// A signed URL lives ten minutes. Ask for a new one this long before it runs out, so an image
// that re-renders near the end of the window never gets a link that dies mid-load.
export const URL_REFRESH_MARGIN_MS = 90 * 1000;

const THUMB_EDGE = 320;

// --- Hashing ---------------------------------------------------------------------------------

export async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// --- This device's own copies ------------------------------------------------------------------

/**
 * The bytes of photos this device uploaded (or downloaded for a backup), by photo id. Stored in
 * the device store, where the photo table keeps one copy of each picture however many keys hold
 * it, so this costs nothing beyond what the inline photo already cost.
 */
export function createLocalPhotoCache({ read = () => readStoredJson(PHOTO_CACHE_STORAGE_KEY, {}), write = (value) => writeStoredJson(PHOTO_CACHE_STORAGE_KEY, value) } = {}) {
  let map = null;
  const load = () => {
    if (!map) {
      const stored = read();
      map = stored && typeof stored === 'object' ? { ...stored } : {};
    }
    return map;
  };
  return {
    get: (id) => (id ? load()[id] || '' : ''),
    set: (id, dataUrl) => {
      if (!id || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
      const current = load();
      if (current[id] === dataUrl) return;
      map = { ...current, [id]: dataUrl };
      write(map);
    },
    /** Drops copies no record points at any more. */
    prune: (keepIds) => {
      const current = load();
      const kept = Object.fromEntries(Object.entries(current).filter(([id]) => keepIds.has(id)));
      if (Object.keys(kept).length === Object.keys(current).length) return;
      map = kept;
      write(map);
    },
    size: () => Object.keys(load()).length,
  };
}

// --- Thumbnails --------------------------------------------------------------------------------

/** A small WebP for lists and grids, or null where the browser cannot make one. */
export async function makeThumbnail(blob, maxEdge = THUMB_EDGE) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap = null;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width || 1, bitmap.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumb = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.72));
    // A browser without a WebP encoder quietly hands back PNG; the slot is WebP, so skip it and
    // let the list show the full photo instead.
    return thumb && thumb.type === 'image/webp' ? thumb : null;
  } catch {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

// --- Uploading one photo ----------------------------------------------------------------------

const defaultClient = { requestPhotoUploadUrl, putPhotoBytes, completeCloudPhoto };

/**
 * Sends one inline photo to cloud storage and returns the stored photo.
 *
 * The checksum is taken from the bytes as the record holds them, before any shrinking, so every
 * device holding the same picture names the same stored photo: the one-time migration can run on
 * all of a keeper's devices at once and still store each photo once.
 */
export async function uploadInlinePhoto(dataUrl, options = {}) {
  const {
    animalId,
    kind = 'gallery',
    addedAt = null,
    client = defaultClient,
    shrink = resizeImageBlob,
    thumbnail = makeThumbnail,
    hash = sha256Hex,
  } = options;
  const source = dataUrlToBlob(dataUrl);
  if (!source || !source.size) throw new Error('Photo has no readable data.');
  const checksum = await hash(source);

  let body = source;
  let width;
  let height;
  // Photos taken since the shrink-on-capture change are already within budget; older ones and odd
  // formats are brought into line here (utils/imageResize, the same engine as capture).
  if (!UPLOADABLE_TYPES.has(source.type) || source.size > PHOTO_PRESET.maxBytes) {
    try {
      const resized = await shrink(source, PHOTO_PRESET);
      const blob = dataUrlToBlob(resized.dataUrl);
      if (blob && blob.size) {
        body = blob;
        width = resized.width;
        height = resized.height;
      }
    } catch {
      // Sent as it is; the backend decides.
    }
  }
  if (!UPLOADABLE_TYPES.has(body.type)) throw new Error(`Photos of type ${body.type || 'unknown'} stay on this device.`);

  const started = await client.requestPhotoUploadUrl({
    animalId: animalId || undefined,
    kind,
    // When the photo was added on the device. The backend lets photos from before the per-animal
    // limits existed through, so a photo taken back then never stays on one device only.
    addedAt: addedAt || undefined,
    mimeType: body.type,
    sizeBytes: body.size,
    checksum,
    width,
    height,
  });
  if (started.alreadyUploaded) return started.photo;
  if (!started.upload) throw new Error('No upload address was given for the photo.');

  await client.putPhotoBytes(started.upload, body);
  if (started.thumbUpload) {
    try {
      const thumb = await thumbnail(body);
      if (thumb) await client.putPhotoBytes(started.thumbUpload, thumb);
    } catch {
      // A photo without a thumbnail is still a stored photo.
    }
  }
  const done = await client.completeCloudPhoto(started.photo.id, { width, height });
  return done.photo;
}

// --- The queue --------------------------------------------------------------------------------

/** The animal already holds as many photos as the plan keeps per animal (PHOTO_QUOTA, scope animal). */
export const isAnimalPhotoLimit = (error) => error?.details?.code === 'PHOTO_QUOTA' && error?.details?.scope === 'animal';

// Errors that will fail the same way for every other photo in this run. A full animal is not one
// of them: it says nothing about the other animals' photos.
const stopsTheRun = (error) => !isAnimalPhotoLimit(error) && ['unauthorized', 'forbidden', 'connection', 'config'].includes(error?.kind);

/**
 * One pass over the photos still on the device. Sequential on purpose: each upload decodes and
 * may re-encode a photo, and a phone does that one at a time without dropping frames.
 *
 * Returns the swaps (data URL -> photo id) for photoRefs.applyPhotoSwaps. A photo that fails stays
 * inline and is simply tried again on the next pass; nothing is lost by failing.
 */
// A photo that keeps failing for a reason of its own (a format nothing can decode) is not retried
// on every sync of the session; reloading the app tries it again.
const MAX_ATTEMPTS_PER_SESSION = 3;
const sessionFailures = new Map();

export async function runPhotoUploadQueue(snakes, options = {}) {
  const { upload = uploadInlinePhoto, cache = null, limit = 20, shouldStop = () => false, failures = sessionFailures } = options;
  const pending = collectPendingPhotoUploads(snakes).filter((item) => (failures.get(item.dataUrl) || 0) < MAX_ATTEMPTS_PER_SESSION);
  const swaps = new Map();
  // Animals the backend called full in this run: their other photos would be refused the same way.
  const fullAnimals = new Set();
  let failed = 0;
  let stoppedBy = null;
  for (const item of pending.slice(0, limit)) {
    if (shouldStop()) break;
    if (fullAnimals.has(item.snakeId)) continue;
    try {
      const photo = await upload(item.dataUrl, { animalId: item.snakeId, kind: item.kind, addedAt: item.addedAt });
      if (photo?.id && photo.status !== 'pending') {
        swaps.set(item.dataUrl, photo.id);
        cache?.set(photo.id, item.dataUrl);
      }
    } catch (error) {
      failed += 1;
      if (isAnimalPhotoLimit(error)) {
        // Over the plan's limit for this animal. The photo stays on this device (and in backups)
        // and is offered again on later passes, so it goes up once the animal has room.
        fullAnimals.add(item.snakeId);
        failures.set(item.dataUrl, (failures.get(item.dataUrl) || 0) + 1);
        continue;
      }
      if (stopsTheRun(error)) {
        stoppedBy = error;
        break;
      }
      failures.set(item.dataUrl, (failures.get(item.dataUrl) || 0) + 1);
      console.warn('[photos] upload failed; the photo stays on this device and is tried again later', error?.message || error);
    }
  }
  return { swaps, failed, pending: pending.length, remaining: Math.max(0, pending.length - swaps.size), stoppedBy, fullAnimals: [...fullAnimals] };
}

// --- Showing stored photos --------------------------------------------------------------------

/**
 * Turns `photo:{id}` into something an <img> can load. This device's own copy wins (instant and
 * offline); otherwise a signed URL, asked for in batches and cached until shortly before it
 * expires. Values that are not references pass through unchanged, so callers can hand it any
 * photo value.
 */
export function createPhotoUrlResolver(options = {}) {
  const {
    fetchUrls = fetchCloudPhotoUrls,
    restore = restoreCloudPhoto,
    localCache = null,
    toBrowserUrl = resolveBackendUrl,
    now = () => Date.now(),
    refreshMarginMs = URL_REFRESH_MARGIN_MS,
    batchDelayMs = 25,
    schedule = (fn, ms) => setTimeout(fn, ms),
  } = options;
  const entries = new Map();
  const inflight = new Map();
  const listeners = new Set();
  let queued = new Map();
  let timer = null;
  const restored = new Set();

  const isFresh = (entry) => Boolean(entry) && entry.expiresAt - now() > refreshMarginMs;
  const notify = () => listeners.forEach((listener) => {
    try { listener(); } catch { /* a listener's problem is its own */ }
  });

  const flush = async () => {
    timer = null;
    const batch = queued;
    queued = new Map();
    const ids = [...batch.keys()];
    if (!ids.length) return;
    try {
      const result = await fetchUrls(ids);
      const byId = new Map((result?.photos || []).map((photo) => [photo.id, photo]));
      ids.forEach((id) => {
        const photo = byId.get(id);
        if (photo) {
          const entry = {
            url: toBrowserUrl(photo.url),
            thumbUrl: toBrowserUrl(photo.thumbUrl || photo.url),
            expiresAt: Date.parse(photo.expiresAt) || now() + 5 * 60 * 1000,
          };
          entries.set(id, entry);
          // Deleted but not purged, and still on a card here: the delete was undone somewhere
          // (an undo, a restored backup). Bring the stored photo back before the purge takes it.
          if (photo.status === 'deleted' && !restored.has(id)) {
            restored.add(id);
            Promise.resolve(restore(id)).catch(() => restored.delete(id));
          }
          batch.get(id)(entry);
        } else {
          batch.get(id)(null);
        }
      });
      notify();
    } catch {
      batch.forEach((resolve) => resolve(null));
    } finally {
      ids.forEach((id) => inflight.delete(id));
    }
  };

  const load = (id) => {
    if (inflight.has(id)) return inflight.get(id);
    const promise = new Promise((resolve) => queued.set(id, resolve));
    inflight.set(id, promise);
    if (!timer) timer = schedule(flush, batchDelayMs);
    return promise;
  };

  const pick = (entry, variant) => (variant === 'thumb' ? entry.thumbUrl || entry.url : entry.url);

  return {
    /** What to show right now, without waiting. '' while a reference is still being resolved. */
    peek(value, variant = 'full') {
      const id = photoIdFromRef(value);
      if (!id) return typeof value === 'string' ? value : '';
      const local = localCache?.get(id);
      if (local) return local;
      const entry = entries.get(id);
      return entry && entry.expiresAt > now() ? pick(entry, variant) : '';
    },
    async resolve(value, variant = 'full') {
      const id = photoIdFromRef(value);
      if (!id) return typeof value === 'string' ? value : '';
      const local = localCache?.get(id);
      if (local) return local;
      let entry = entries.get(id);
      if (!isFresh(entry)) entry = await load(id);
      return entry ? pick(entry, variant) : '';
    },
    /** When the URL for this reference should be asked for again, or 0 when it never needs to be. */
    refreshAt(value) {
      const id = photoIdFromRef(value);
      if (!id || localCache?.get(id)) return 0;
      const entry = entries.get(id);
      return entry ? entry.expiresAt - refreshMarginMs : 0;
    },
    /** The photo's bytes as a data URL, for backup files and PDFs. Null when they cannot be had. */
    async resolveDataUrl(id, fetchImpl = typeof fetch === 'function' ? fetch : null) {
      if (!id) return null;
      const local = localCache?.get(id);
      if (local) return local;
      const url = await this.resolve(`photo:${id}`);
      if (!url || !fetchImpl) return null;
      const response = await fetchImpl(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      // Kept, so the next backup does not download it again.
      localCache?.set(id, dataUrl);
      return dataUrl;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Forgets every signed URL, for a sign-out. */
    clear() {
      entries.clear();
      notify();
    },
  };
}

let sharedCache = null;
let sharedResolver = null;

export const getLocalPhotoCache = () => {
  if (!sharedCache) sharedCache = createLocalPhotoCache();
  return sharedCache;
};

export const getPhotoResolver = () => {
  if (!sharedResolver) sharedResolver = createPhotoUrlResolver({ localCache: getLocalPhotoCache() });
  return sharedResolver;
};
