import { describe, expect, it } from 'vitest';
import {
  base64Bytes,
  extensionFor,
  isDataUri,
  photoFingerprint,
  planPhotoUpload,
  resolveCoverPhoto,
  splitDataUri,
} from './listingPhoto';

const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';

describe('resolveCoverPhoto', () => {
  it('leads with the cover the animal card already shows', () => {
    expect(resolveCoverPhoto({ imageUrl: 'https://cdn/a.jpg', photos: ['https://cdn/b.jpg'] }))
      .toBe('https://cdn/a.jpg');
  });

  it('falls back to the most recent photo, which is the one the app treats as current', () => {
    expect(resolveCoverPhoto({ photos: ['https://cdn/old.jpg', 'https://cdn/new.jpg'] }))
      .toBe('https://cdn/new.jpg');
  });

  it('reads the shapes a photo entry actually comes in', () => {
    expect(resolveCoverPhoto({ photos: [{ url: 'https://cdn/u.jpg' }] })).toBe('https://cdn/u.jpg');
    expect(resolveCoverPhoto({ photos: [{ dataUrl: dataUri }] })).toBe(dataUri);
  });

  it('says nothing rather than guessing when there is no photo', () => {
    expect(resolveCoverPhoto({ photos: [] })).toBe('');
    expect(resolveCoverPhoto(undefined)).toBe('');
  });
});

describe('planPhotoUpload', () => {
  it('uploads a picture that only exists on this device', () => {
    const plan = planPhotoUpload({ id: '26-M-239', imageUrl: dataUri });
    expect(plan.action).toBe('upload');
    expect(plan.dataUri).toBe(dataUri);
  });

  it('links a picture the marketplace can already reach, without re-uploading it', () => {
    expect(planPhotoUpload({ id: 'x', imageUrl: '/marketplace/media/abc' }))
      .toEqual({ action: 'link', imageUrl: '/marketplace/media/abc' });
  });

  /** Re-saving an animal must not push the same few megabytes up again. */
  it('reuses the uploaded picture when the photo has not changed', () => {
    const plan = planPhotoUpload({
      id: 'x',
      imageUrl: dataUri,
      marketplaceImageUrl: '/marketplace/media/abc',
      marketplaceImageFingerprint: photoFingerprint(dataUri),
    });
    expect(plan).toMatchObject({ action: 'reuse', imageUrl: '/marketplace/media/abc' });
  });

  it('uploads again once the breeder swaps the photo', () => {
    const plan = planPhotoUpload({
      id: 'x',
      imageUrl: dataUri,
      marketplaceImageUrl: '/marketplace/media/abc',
      marketplaceImageFingerprint: photoFingerprint('data:image/png;base64,SOMETHINGELSE='),
    });
    expect(plan.action).toBe('upload');
  });

  it('does nothing for an animal with no photo', () => {
    expect(planPhotoUpload({ id: 'x' })).toEqual({ action: 'none' });
  });
});

describe('preparing the upload body', () => {
  it('splits a data URI into what the endpoint asks for', () => {
    expect(splitDataUri(dataUri)).toMatchObject({ mimeType: 'image/jpeg' });
    expect(splitDataUri(dataUri)?.dataBase64.startsWith('/9j/')).toBe(true);
  });

  it('refuses what it cannot read instead of sending nonsense', () => {
    expect(splitDataUri('https://cdn/a.jpg')).toBeNull();
    expect(splitDataUri('data:image/jpeg,notbase64')).toBeNull();
    expect(splitDataUri('')).toBeNull();
  });

  it('measures the decoded size, which is what the 5 MB limit counts', () => {
    expect(base64Bytes('AAAA')).toBe(3);
    expect(base64Bytes('AAA=')).toBe(2);
    expect(base64Bytes('AA==')).toBe(1);
    expect(base64Bytes('')).toBe(0);
  });

  it('names the file something the mime type agrees with', () => {
    expect(extensionFor('image/png')).toBe('png');
    expect(extensionFor('image/webp')).toBe('webp');
    expect(extensionFor('application/octet-stream')).toBe('jpg');
  });

  it('knows a device-only picture from a reachable one', () => {
    expect(isDataUri(dataUri)).toBe(true);
    expect(isDataUri('https://cdn/a.jpg')).toBe(false);
    expect(isDataUri(undefined)).toBe(false);
  });
});
