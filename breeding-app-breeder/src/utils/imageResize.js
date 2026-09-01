// Shrinks images at capture time, before they ever become a stored data URL.
//
// Photos live inside the animal record itself (`snake.photos[].url` is a base64 data URL), so the
// same bytes are written to localStorage, pushed in the cloud sync body, and embedded in PDF
// exports. Resizing here is the only place that fixes all three at once -- a server-side pipeline
// would fix none of them, because the breeder photo path never uploads a file to the backend.
//
// Deliberately dependency-free: decode with createImageBitmap, redraw onto a canvas, re-encode.
// Re-encoding also drops every EXIF tag, GPS coordinates included.

// jsPDF 2.5 cannot decode WebP, and App.jsx passes stored photo data URLs straight to
// `doc.addImage(url, 'JPEG', ...)`. Emitting WebP here would break animal catalog PDFs, so the
// presets stay on JPEG/PNG even though WebP would be ~30% smaller.

export const PHOTO_PRESET = {
  name: 'photo',
  maxDimension: 1600,
  maxBytes: 400 * 1024,
  mimeType: 'image/jpeg',
  qualitySteps: [0.82, 0.7, 0.6],
  preserveAlpha: false,
};

export const LOGO_PRESET = {
  name: 'logo',
  maxDimension: 512,
  maxBytes: 150 * 1024,
  mimeType: 'image/jpeg',
  qualitySteps: [0.9, 0.8],
  // A logo on a transparent background must not gain a black rectangle, so alpha wins over size.
  preserveAlpha: true,
};

export const AVATAR_PRESET = {
  name: 'avatar',
  maxDimension: 512,
  maxBytes: 100 * 1024,
  mimeType: 'image/jpeg',
  qualitySteps: [0.82, 0.7, 0.6],
  preserveAlpha: false,
};

// --- Pure helpers ---------------------------------------------------------------------------
// Kept free of canvas/DOM so they can be unit tested directly.

// Fits the image inside a square of `maxDimension`, preserving aspect ratio. Never upscales:
// a 400px photo asked to fit 1600 comes back as 400px, not a blurry 1600px one.
export function computeTargetDimensions(width, height, maxDimension) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 0, height: 0 };
  }
  const largest = Math.max(w, h);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0 || largest <= maxDimension) {
    return { width: Math.round(w), height: Math.round(h) };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

// Byte count of the payload a base64 data URL carries, without decoding it. Every 4 base64
// characters encode 3 bytes; trailing '=' padding stands in for bytes that were never there.
//
// Measured from indices rather than by slicing: this runs over every stored photo whenever the
// settings panel re-renders, and copying a multi-megabyte string per photo to read its length is
// pure waste.
export function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return 0;
  const bodyLength = dataUrl.length - commaIndex - 1;
  if (bodyLength <= 0) return 0;
  if (dataUrl.lastIndexOf(';base64', commaIndex) < 0) return bodyLength;
  const last = dataUrl.charCodeAt(dataUrl.length - 1);
  const secondLast = dataUrl.charCodeAt(dataUrl.length - 2);
  const padding = last === 61 ? (secondLast === 61 ? 2 : 1) : 0; // 61 is '='
  return Math.max(0, Math.floor((bodyLength * 3) / 4) - padding);
}

// True when the source is already small enough that re-encoding would only lose quality.
export function shouldSkipResize({ width, height, bytes }, preset) {
  if (!preset) return true;
  const withinBytes = !Number.isFinite(preset.maxBytes) || !(bytes > preset.maxBytes);
  const largest = Math.max(Number(width) || 0, Number(height) || 0);
  const withinDimensions = !Number.isFinite(preset.maxDimension) || largest <= preset.maxDimension;
  return withinBytes && withinDimensions;
}

// PNG only when the preset asks to keep alpha AND the image actually has some; otherwise JPEG,
// which is far smaller for photographic content.
export function pickOutputType(preset, hasAlpha) {
  if (preset?.preserveAlpha && hasAlpha) return 'image/png';
  return preset?.mimeType || 'image/jpeg';
}

// The ordered attempts used to land under `maxBytes`. JPEG walks down the quality steps; PNG has
// no quality knob, so it walks down the dimensions instead.
export function buildEncodeLadder(preset, outputType) {
  if (outputType === 'image/png') {
    return [1, 0.75, 0.5].map(scale => ({ scale, quality: undefined }));
  }
  const steps = Array.isArray(preset?.qualitySteps) && preset.qualitySteps.length
    ? preset.qualitySteps
    : [0.82];
  return steps.map(quality => ({ scale: 1, quality }));
}

// Runs `task` over `items` with at most `limit` in flight. Decoding ten full-resolution bitmaps
// at once will exhaust memory on a mid-range Android, so photo batches go through here.
export async function mapWithConcurrency(items, limit, task) {
  const list = Array.from(items || []);
  const results = new Array(list.length);
  const width = Math.max(1, Math.floor(limit) || 1);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(width, list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(list[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// --- Browser plumbing -----------------------------------------------------------------------

export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return null;
  const header = dataUrl.slice(0, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);
  const mimeMatch = /^data:([^;,]+)/i.exec(header);
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  if (!/;base64/i.test(header)) {
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  }
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

// `imageOrientation: 'from-image'` is what stops phone photos coming out sideways: it bakes the
// EXIF rotation into the bitmap, and the canvas re-encode then discards the tag itself.
async function decodeSource(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => { if (typeof bitmap.close === 'function') bitmap.close(); },
      };
    } catch {
      // Older WebViews reject the options bag; fall through to the <img> path.
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try {
      return new OffscreenCanvas(width, height);
    } catch {
      // Safari below 16.4 exposes the constructor without 2d context support.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Halving repeatedly gives a much cleaner result than one large drawImage, which aliases badly
// once the ratio passes ~2x.
function drawScaled(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  let currentWidth = sourceWidth;
  let currentHeight = sourceHeight;
  let current = source;
  let intermediate = null;

  while (currentWidth > targetWidth * 2 && currentHeight > targetHeight * 2) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
    const step = createCanvas(nextWidth, nextHeight);
    const stepContext = step.getContext('2d');
    if (!stepContext) break;
    stepContext.imageSmoothingEnabled = true;
    stepContext.imageSmoothingQuality = 'high';
    stepContext.drawImage(current, 0, 0, nextWidth, nextHeight);
    current = step;
    intermediate = step;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const canvas = createCanvas(targetWidth, targetHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context not available');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(current, 0, 0, targetWidth, targetHeight);
  if (intermediate && typeof intermediate.width === 'number') {
    intermediate.width = 0;
    intermediate.height = 0;
  }
  return { canvas, context };
}

// Samples the alpha channel rather than reading every pixel -- enough to tell a transparent logo
// from an opaque one without walking a megapixel of data.
function detectAlpha(context, width, height) {
  try {
    const { data } = context.getImageData(0, 0, width, height);
    const step = Math.max(4, Math.floor(data.length / 4 / 4096) * 4);
    for (let index = 3; index < data.length; index += step) {
      if (data[index] < 255) return true;
    }
    return false;
  } catch {
    // A tainted canvas cannot be read; assume alpha so a logo is never flattened onto black.
    return true;
  }
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
      type,
      quality
    );
  });
}

/**
 * Resizes a Blob/File to fit `preset`, returning the encoded data URL and what it cost.
 *
 * Falls back to the untouched source whenever the image is already small enough, and rethrows
 * nothing on encode failure -- callers get the original bytes rather than losing the photo.
 *
 * @returns {Promise<{dataUrl: string, width: number, height: number, bytes: number,
 *   type: string, originalBytes: number, resized: boolean}>}
 */
export async function resizeImageBlob(blob, preset = PHOTO_PRESET) {
  if (!blob) throw new Error('No image supplied');
  const originalBytes = blob.size || 0;
  const decoded = await decodeSource(blob);

  try {
    const { width: sourceWidth, height: sourceHeight } = decoded;
    if (!sourceWidth || !sourceHeight) throw new Error('Invalid image dimensions');

    if (shouldSkipResize({ width: sourceWidth, height: sourceHeight, bytes: originalBytes }, preset)) {
      return {
        dataUrl: await blobToDataUrl(blob),
        width: sourceWidth,
        height: sourceHeight,
        bytes: originalBytes,
        type: blob.type || '',
        originalBytes,
        resized: false,
      };
    }

    const base = computeTargetDimensions(sourceWidth, sourceHeight, preset.maxDimension);
    let best = null;

    // Draw once at full target size to sample alpha, then let the ladder decide the encoding.
    const probe = drawScaled(decoded.source, sourceWidth, sourceHeight, base.width, base.height);
    const hasAlpha = preset.preserveAlpha ? detectAlpha(probe.context, base.width, base.height) : false;
    const outputType = pickOutputType(preset, hasAlpha);
    const ladder = buildEncodeLadder(preset, outputType);

    for (let attempt = 0; attempt < ladder.length; attempt += 1) {
      const { scale, quality } = ladder[attempt];
      const width = Math.max(1, Math.round(base.width * scale));
      const height = Math.max(1, Math.round(base.height * scale));
      const canvas = scale === 1
        ? probe.canvas
        : drawScaled(decoded.source, sourceWidth, sourceHeight, width, height).canvas;
      const encoded = await canvasToBlob(canvas, outputType, quality);
      if (!best || encoded.size < best.blob.size) {
        best = { blob: encoded, width, height };
      }
      if (encoded.size <= preset.maxBytes) break;
    }

    if (!best) throw new Error('Canvas encoding produced no output');

    // A tiny source can re-encode larger than it started; keep whichever is actually smaller.
    if (originalBytes > 0 && best.blob.size >= originalBytes) {
      return {
        dataUrl: await blobToDataUrl(blob),
        width: sourceWidth,
        height: sourceHeight,
        bytes: originalBytes,
        type: blob.type || '',
        originalBytes,
        resized: false,
      };
    }

    return {
      dataUrl: await blobToDataUrl(best.blob),
      width: best.width,
      height: best.height,
      bytes: best.blob.size,
      type: outputType,
      originalBytes,
      resized: true,
    };
  } finally {
    decoded.release();
  }
}

/** Resizes a File from an <input type="file"> or a camera capture. */
export function resizeImageFile(file, preset = PHOTO_PRESET) {
  return resizeImageBlob(file, preset);
}

/** Resizes an already-stored data URL. Used by the compress-existing-photos migration. */
export async function resizeDataUrl(dataUrl, preset = PHOTO_PRESET) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) throw new Error('Not a data URL');
  return resizeImageBlob(blob, preset);
}
