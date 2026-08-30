// Exercises the image resize engine in a real browser: decode -> downscale -> encode.
//
// The vitest suite in src/utils/imageResize.test.js only covers the pure helpers, because canvas
// encoding, createImageBitmap and EXIF handling do not exist under jsdom. Those are the parts most
// likely to break silently -- a photo that comes out sideways or three times too big still "works"
// as far as a unit test is concerned.
//
// Standalone on purpose: the Playwright suite in tests/e2e needs a running backend and a seeded
// login, and none of that is relevant here. Run with `npm run test:browser`.

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../../src/utils/imageResize.js');

// The engine is an ES module with no dependencies; bundle it to an IIFE so it can be dropped into
// a blank page as a plain script tag.
const bundled = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: 'IR',
  write: false,
});
const source = bundled.outputFiles[0].text;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: source });

const results = await page.evaluate(async () => {
  const out = [];
  const check = (name, pass, detail) => out.push({ name, pass, detail });

  // A flat colour would compress to almost nothing and prove very little, so this paints a
  // gradient plus scattered blocks to give the JPEG encoder real work.
  const makeImage = (w, h, { alpha = false } = {}) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (alpha) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(200,40,40,1)';
      ctx.fillRect(0, 0, w / 2, h / 2);
      return canvas;
    }
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#2b6cb0');
    gradient.addColorStop(1, '#f6ad55');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i += 1) {
      ctx.fillStyle = `rgba(${(i * 7) % 255},${(i * 13) % 255},${(i * 29) % 255},0.5)`;
      ctx.fillRect((i * 37) % w, (i * 91) % h, 12, 12);
    }
    return canvas;
  };

  const toFile = (canvas, type, quality, name) => new Promise(resolve => {
    canvas.toBlob(blob => resolve(new File([blob], name, { type })), type, quality);
  });

  // --- A full-resolution phone photo --------------------------------------------------------
  const big = await toFile(makeImage(4000, 3000), 'image/jpeg', 0.95, 'phone.jpg');
  const photo = await IR.resizeImageFile(big, IR.PHOTO_PRESET);
  check('4000x3000 photo caps its long edge at 1600',
    photo.width === 1600 && photo.height === 1200, `${photo.width}x${photo.height}`);
  check('4000x3000 photo lands under the 400 KB budget',
    photo.bytes <= IR.PHOTO_PRESET.maxBytes,
    `${(photo.bytes / 1024).toFixed(1)} KB from ${(big.size / 1024).toFixed(1)} KB`);
  check('output is a JPEG data URL, never WebP (jsPDF cannot decode WebP)',
    photo.type === 'image/jpeg' && photo.dataUrl.startsWith('data:image/jpeg;base64,'), photo.type);
  check('reported byte count matches the data URL',
    Math.abs(IR.estimateDataUrlBytes(photo.dataUrl) - photo.bytes) <= 2,
    `${IR.estimateDataUrlBytes(photo.dataUrl)} vs ${photo.bytes}`);
  const redecoded = await createImageBitmap(IR.dataUrlToBlob(photo.dataUrl));
  check('the result re-decodes at the reported size',
    redecoded.width === photo.width && redecoded.height === photo.height,
    `${redecoded.width}x${redecoded.height}`);

  // --- A small image must be left exactly as it was ------------------------------------------
  const small = await toFile(makeImage(400, 300), 'image/jpeg', 0.8, 'small.jpg');
  const untouched = await IR.resizeImageFile(small, IR.PHOTO_PRESET);
  check('small photo is not upscaled or re-encoded',
    untouched.resized === false && untouched.width === 400 && untouched.bytes === small.size,
    `${untouched.width}x${untouched.height} resized=${untouched.resized}`);

  // --- Logo alpha handling -------------------------------------------------------------------
  const transparent = await toFile(makeImage(2000, 2000, { alpha: true }), 'image/png', undefined, 'logo.png');
  const keptPng = await IR.resizeImageFile(transparent, IR.LOGO_PRESET);
  check('transparent logo stays PNG rather than being flattened onto black',
    keptPng.type === 'image/png' && keptPng.width === 512, `${keptPng.type} ${keptPng.width}px`);

  const opaque = await toFile(makeImage(2000, 2000), 'image/png', undefined, 'opaque.png');
  const asJpeg = await IR.resizeImageFile(opaque, IR.LOGO_PRESET);
  check('opaque logo becomes JPEG', asJpeg.type === 'image/jpeg', asJpeg.type);
  check('opaque logo fits the 150 KB budget',
    asJpeg.bytes <= IR.LOGO_PRESET.maxBytes, `${(asJpeg.bytes / 1024).toFixed(1)} KB`);

  // --- EXIF orientation ----------------------------------------------------------------------
  // Splices an APP1/EXIF block declaring Orientation=6 (rotate 90 clockwise) into a landscape
  // JPEG. Decoded correctly the bitmap is portrait; ignore the tag and it stays landscape, which
  // is exactly the sideways-phone-photo bug this engine is meant to fix.
  const landscape = await toFile(makeImage(2000, 1000), 'image/jpeg', 0.9, 'rot.jpg');
  const sourceBytes = new Uint8Array(await landscape.arrayBuffer());
  const app1 = [
    0xff, 0xe1, 0x00, 0x22,                          // APP1 marker, segment length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,              // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,  // little-endian TIFF header, IFD0 at offset 8
    0x01, 0x00,                                      // one directory entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,  // tag 0x0112 Orientation, type SHORT, count 1
    0x06, 0x00, 0x00, 0x00,                          // value 6
    0x00, 0x00, 0x00, 0x00,                          // no next IFD
  ];
  const withExif = new Uint8Array(sourceBytes.length + app1.length);
  withExif.set(sourceBytes.subarray(0, 2), 0);       // keep the SOI marker first
  withExif.set(app1, 2);
  withExif.set(sourceBytes.subarray(2), 2 + app1.length);
  const rotated = await IR.resizeImageFile(new File([withExif], 'rot.jpg', { type: 'image/jpeg' }), IR.PHOTO_PRESET);
  check('EXIF orientation 6 is baked into the output',
    rotated.height > rotated.width,
    `${rotated.width}x${rotated.height} (landscape source, portrait expected)`);

  return out;
});

await browser.close();

let failed = 0;
for (const result of results) {
  if (!result.pass) failed += 1;
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name}  [${result.detail}]`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
