import { describe, expect, it, vi } from 'vitest';
import { createLocalPhotoCache, createPhotoUrlResolver, runPhotoUploadQueue, uploadInlinePhoto, URL_REFRESH_MARGIN_MS } from './cloudPhotos';

const INLINE_A = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
const INLINE_B = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAE';

const memoryCache = (initial = {}) => {
  let stored = { ...initial };
  return createLocalPhotoCache({ read: () => stored, write: (value) => { stored = value; } });
};

const signed = (id, expiresAt, status = 'ready') => ({
  id,
  status,
  mimeType: 'image/jpeg',
  url: `https://storage/read/${id}?token=t`,
  thumbUrl: `https://storage/read/${id}.thumb.webp?token=t`,
  expiresAt: new Date(expiresAt).toISOString(),
});

/** A resolver on a fake clock, flushing its batch as soon as it is scheduled. */
const resolverFor = (fetchUrls, options = {}) => {
  let clock = Date.parse('2026-10-16T10:00:00.000Z');
  const resolver = createPhotoUrlResolver({
    fetchUrls,
    restore: options.restore || vi.fn(async () => ({})),
    localCache: options.localCache || null,
    toBrowserUrl: (url) => url,
    now: () => clock,
    schedule: (fn) => Promise.resolve().then(fn),
  });
  return { resolver, advance: (ms) => { clock += ms; }, now: () => clock };
};

describe('resolving photo references', () => {
  it('passes values that are not references through untouched', async () => {
    const { resolver } = resolverFor(vi.fn());
    expect(await resolver.resolve(INLINE_A)).toBe(INLINE_A);
    expect(resolver.peek('https://cdn/p.jpg')).toBe('https://cdn/p.jpg');
    expect(resolver.peek(undefined)).toBe('');
  });

  it('asks for many references in one batch and caches the signed URLs', async () => {
    const fetchUrls = vi.fn(async (ids) => ({ photos: ids.map((id) => signed(id, Date.parse('2026-10-16T10:10:00.000Z'))) }));
    const { resolver } = resolverFor(fetchUrls);
    const [one, two] = await Promise.all([resolver.resolve('photo:one'), resolver.resolve('photo:two', 'thumb')]);
    expect(fetchUrls).toHaveBeenCalledTimes(1);
    expect(fetchUrls).toHaveBeenCalledWith(['one', 'two']);
    expect(one).toBe('https://storage/read/one?token=t');
    expect(two).toBe('https://storage/read/two.thumb.webp?token=t');
    expect(resolver.peek('photo:one')).toBe(one);
    await resolver.resolve('photo:one');
    expect(fetchUrls).toHaveBeenCalledTimes(1);
  });

  it('asks again shortly before the signed URL expires', async () => {
    const fetchUrls = vi.fn(async (ids) => ({ photos: ids.map((id) => signed(id, Date.parse('2026-10-16T10:10:00.000Z'))) }));
    const { resolver, advance, now } = resolverFor(fetchUrls);
    await resolver.resolve('photo:one');
    expect(resolver.refreshAt('photo:one')).toBe(Date.parse('2026-10-16T10:10:00.000Z') - URL_REFRESH_MARGIN_MS);
    // Inside the margin: still shown, but due for a new link.
    advance(10 * 60 * 1000 - URL_REFRESH_MARGIN_MS + 1000);
    expect(resolver.peek('photo:one')).toBeTruthy();
    fetchUrls.mockImplementationOnce(async (ids) => ({ photos: ids.map((id) => signed(id, now() + 10 * 60 * 1000)) }));
    await resolver.resolve('photo:one');
    expect(fetchUrls).toHaveBeenCalledTimes(2);
  });

  it("prefers this device's own copy, which also works offline", async () => {
    const fetchUrls = vi.fn();
    const { resolver } = resolverFor(fetchUrls, { localCache: memoryCache({ mine: INLINE_A }) });
    expect(resolver.peek('photo:mine')).toBe(INLINE_A);
    expect(await resolver.resolve('photo:mine')).toBe(INLINE_A);
    expect(fetchUrls).not.toHaveBeenCalled();
  });

  it('brings back a soft-deleted photo that a record still shows', async () => {
    const restore = vi.fn(async () => ({}));
    const fetchUrls = vi.fn(async (ids) => ({ photos: ids.map((id) => signed(id, Date.parse('2026-10-16T10:10:00.000Z'), 'deleted')) }));
    const { resolver } = resolverFor(fetchUrls, { restore });
    expect(await resolver.resolve('photo:undone')).toContain('undone');
    expect(restore).toHaveBeenCalledWith('undone');
  });

  it('shows nothing, rather than failing, when the backend cannot be reached', async () => {
    const { resolver } = resolverFor(vi.fn(async () => { throw new Error('offline'); }));
    expect(await resolver.resolve('photo:one')).toBe('');
  });
});

describe('uploading one photo', () => {
  const client = (start) => ({
    requestPhotoUploadUrl: vi.fn(async () => start),
    putPhotoBytes: vi.fn(async () => ({ ok: true })),
    completeCloudPhoto: vi.fn(async (id) => ({ photo: { id, status: 'ready' } })),
  });

  it('skips the bytes entirely when the account already has the photo', async () => {
    const api = client({ alreadyUploaded: true, photo: { id: 'existing', status: 'ready' } });
    const photo = await uploadInlinePhoto(INLINE_A, { animalId: 'a1', client: api, hash: async () => 'f'.repeat(64) });
    expect(photo.id).toBe('existing');
    expect(api.requestPhotoUploadUrl).toHaveBeenCalledWith(expect.objectContaining({ animalId: 'a1', checksum: 'f'.repeat(64), mimeType: 'image/jpeg' }));
    expect(api.putPhotoBytes).not.toHaveBeenCalled();
    expect(api.completeCloudPhoto).not.toHaveBeenCalled();
  });

  it('puts the photo and its thumbnail, then completes', async () => {
    const upload = { method: 'PUT', url: 'https://storage/upload/p', headers: {}, viaBackend: false };
    const thumbUpload = { ...upload, url: 'https://storage/upload/p.thumb' };
    const api = client({ alreadyUploaded: false, photo: { id: 'new', status: 'pending' }, upload, thumbUpload });
    const thumb = new Blob(['thumb'], { type: 'image/webp' });
    const photo = await uploadInlinePhoto(INLINE_A, { client: api, hash: async () => 'a'.repeat(64), thumbnail: async () => thumb });
    expect(api.putPhotoBytes).toHaveBeenNthCalledWith(1, upload, expect.any(Blob));
    expect(api.putPhotoBytes).toHaveBeenNthCalledWith(2, thumbUpload, thumb);
    expect(api.completeCloudPhoto).toHaveBeenCalledWith('new', expect.any(Object));
    expect(photo).toEqual({ id: 'new', status: 'ready' });
  });

  it('still stores the photo when no thumbnail can be made', async () => {
    const upload = { method: 'PUT', url: 'u', headers: {}, viaBackend: false };
    const api = client({ alreadyUploaded: false, photo: { id: 'new' }, upload, thumbUpload: { ...upload } });
    await uploadInlinePhoto(INLINE_A, { client: api, hash: async () => 'a'.repeat(64), thumbnail: async () => null });
    expect(api.putPhotoBytes).toHaveBeenCalledTimes(1);
    expect(api.completeCloudPhoto).toHaveBeenCalled();
  });
});

describe('the upload queue', () => {
  const animal = (id, url) => ({ id, photos: [{ id: `p-${id}`, url }], imageUrl: url });

  it('uploads each photo once and keeps a copy on the device', async () => {
    const cache = memoryCache();
    const upload = vi.fn(async (dataUrl) => ({ id: dataUrl === INLINE_A ? 'idA' : 'idB', status: 'ready' }));
    const result = await runPhotoUploadQueue([animal('a1', INLINE_A), animal('a2', INLINE_A), animal('a3', INLINE_B)], { upload, cache, failures: new Map() });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledWith(INLINE_A, { animalId: 'a1', kind: 'gallery', addedAt: null });
    expect([...result.swaps.entries()]).toEqual([[INLINE_A, 'idA'], [INLINE_B, 'idB']]);
    expect(cache.get('idA')).toBe(INLINE_A);
    expect(result.remaining).toBe(0);
  });

  it('leaves a failed photo inline and carries on with the rest', async () => {
    const upload = vi.fn(async (dataUrl) => {
      if (dataUrl === INLINE_A) throw Object.assign(new Error('decode failed'), { kind: 'validation' });
      return { id: 'idB', status: 'ready' };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runPhotoUploadQueue([animal('a1', INLINE_A), animal('a2', INLINE_B)], { upload, failures: new Map() });
    warn.mockRestore();
    expect(result.failed).toBe(1);
    expect([...result.swaps.keys()]).toEqual([INLINE_B]);
  });

  it('stops at the first sign that every upload will fail (signed out, offline, over quota)', async () => {
    const upload = vi.fn(async () => { throw Object.assign(new Error('Photo storage limit reached.'), { kind: 'forbidden' }); });
    const result = await runPhotoUploadQueue([animal('a1', INLINE_A), animal('a2', INLINE_B)], { upload, failures: new Map() });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.stoppedBy).toBeTruthy();
    expect(result.swaps.size).toBe(0);
  });

  it('skips only the full animal when the photos-per-animal limit refuses one', async () => {
    const INLINE_C = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAF';
    const full = Object.assign(new Error('This animal already has 3 photos'), {
      kind: 'forbidden',
      details: { code: 'PHOTO_QUOTA', scope: 'animal', animalId: 'a1', limit: 3 },
    });
    const upload = vi.fn(async (dataUrl, { animalId }) => {
      if (animalId === 'a1') throw full;
      return { id: `id-${dataUrl.slice(-1)}`, status: 'ready' };
    });
    const twoPhotos = { id: 'a1', photos: [{ id: 'p1', url: INLINE_A, addedAt: '2026-11-02T09:00:00.000Z' }, { id: 'p2', url: INLINE_B }] };
    const result = await runPhotoUploadQueue([twoPhotos, animal('a2', INLINE_C)], { upload, failures: new Map() });
    // One refusal for a1 is enough; its second photo is not tried, and a2 still goes up.
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledWith(INLINE_A, { animalId: 'a1', kind: 'gallery', addedAt: '2026-11-02T09:00:00.000Z' });
    expect(result.stoppedBy).toBeNull();
    expect(result.fullAnimals).toEqual(['a1']);
    expect([...result.swaps.keys()]).toEqual([INLINE_C]);
  });

  it('still stops the run when the plan has no photos at all', async () => {
    const upload = vi.fn(async () => {
      throw Object.assign(new Error('Feature is not included'), { kind: 'forbidden', details: { code: 'PHOTO_QUOTA', scope: 'plan' } });
    });
    const result = await runPhotoUploadQueue([animal('a1', INLINE_A), animal('a2', INLINE_B)], { upload, failures: new Map() });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(result.stoppedBy).toBeTruthy();
  });

  it('gives up on a photo for the session after repeated failures of its own', async () => {
    const failures = new Map();
    const upload = vi.fn(async () => { throw Object.assign(new Error('bad'), { kind: 'validation' }); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let pass = 0; pass < 5; pass += 1) await runPhotoUploadQueue([animal('a1', INLINE_A)], { upload, failures });
    warn.mockRestore();
    expect(upload).toHaveBeenCalledTimes(3);
  });
});
