import { describe, expect, it } from 'vitest';
import { keepLocalPhotos, mergeBreederSnapshots, prepareAnimalForBackend } from '../App.jsx';

const PHOTO_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
const STAMP = '2026-10-13T13:04:37.794Z';

const hatchling = (overrides = {}) => ({
  id: '26-F-244',
  name: 'Runa × Confusion - 4',
  species: 'ball-python',
  sex: 'F',
  morphs: [],
  hets: [],
  possibleHets: [],
  tags: [],
  groups: ['Hatchlings 2026'],
  logs: {},
  updatedAt: STAMP,
  fieldUpdatedAt: { '*': '2026-09-07T10:39:43.085Z', imageUrl: STAMP },
  ...overrides,
});

const photo = { id: 'photo-mt6pwaek-czjw', url: PHOTO_URL, name: 'Runa.jpg', addedAt: '2026-08-24T04:09:51.788Z' };

describe('photos stored on the device', () => {
  it('upload leaves the cover photo out without stamping it removed', () => {
    const upload = prepareAnimalForBackend(hatchling({ imageUrl: PHOTO_URL, photos: [photo] }));
    expect(upload.imageUrl).toBeUndefined();
    expect(upload.photos).toEqual([]);
    expect(upload.fieldUpdatedAt.imageUrl).toBeUndefined();
    expect(upload.fieldUpdatedAt['*']).toBe('2026-09-07T10:39:43.085Z');
  });

  it('a cloud copy without the cover does not take it off the device', () => {
    // 13 Oct: the server held the cover stamped as removed at the same time as the device's copy.
    const local = hatchling({ imageUrl: PHOTO_URL, photos: [photo] });
    const cloud = hatchling({ photos: [] });
    const merged = mergeBreederSnapshots({ snakes: [local], pairings: [] }, { snakes: [cloud], pairings: [] });
    expect(merged.snakes[0].photos.map(p => p.id)).toEqual([photo.id]);
    expect(merged.snakes[0].imageUrl).toBe(PHOTO_URL);
  });

  it('a cover whose photo was deleted elsewhere goes with it', () => {
    const local = hatchling({ imageUrl: PHOTO_URL, photos: [photo] });
    const cloud = hatchling({ photos: [], removedEntries: { [photo.id]: '2026-10-14T00:00:00.000Z' } });
    const merged = mergeBreederSnapshots({ snakes: [local], pairings: [] }, { snakes: [cloud], pairings: [] });
    expect(merged.snakes[0].photos).toEqual([]);
    expect(merged.snakes[0].imageUrl).toBeUndefined();
  });

  it('a replace from a backup file keeps cloud photo references the cloud already has', () => {
    const cloud = [hatchling({ imageUrl: 'photo:abc', photos: [{ ...photo, url: 'photo:abc', photoId: 'abc' }] })];
    const shown = keepLocalPhotos(cloud, [hatchling({ imageUrl: PHOTO_URL, photos: [photo] })]);
    expect(shown[0].photos.map(p => p.url)).toEqual(['photo:abc']);
    expect(shown[0].imageUrl).toBe('photo:abc');
  });

  it('a replace from a backup file keeps the photos in the file', () => {
    // The device that restores has lost its photos; only the file still holds them.
    const cloud = [hatchling({ photos: [] })];
    const fileSnakes = [hatchling({ imageUrl: PHOTO_URL, photos: [photo] })];
    const deviceBefore = [hatchling({ photos: [] })];
    const shown = keepLocalPhotos(keepLocalPhotos(cloud, fileSnakes), deviceBefore);
    expect(shown[0].photos.map(p => p.id)).toEqual([photo.id]);
    expect(shown[0].imageUrl).toBe(PHOTO_URL);
  });
});

describe('photos in cloud storage', () => {
  const REF = 'photo:3f9a1c';
  const stored = { ...photo, url: REF, photoId: '3f9a1c' };

  it('upload carries photo references and their edit stamp untouched', () => {
    const upload = prepareAnimalForBackend(hatchling({ imageUrl: REF, photos: [stored] }));
    expect(upload.imageUrl).toBe(REF);
    expect(upload.photos).toEqual([stored]);
    // A reference is a real value the server must keep, unlike a device-only data: cover.
    expect(upload.fieldUpdatedAt.imageUrl).toBe(STAMP);
  });

  it('a device that never had the photo receives it from the cloud', () => {
    const local = hatchling({ photos: [], fieldUpdatedAt: { '*': '2026-09-07T10:39:43.085Z' } });
    const cloud = hatchling({ imageUrl: REF, photos: [stored] });
    const merged = mergeBreederSnapshots({ snakes: [local], pairings: [] }, { snakes: [cloud], pairings: [] });
    expect(merged.snakes[0].photos.map(p => p.url)).toEqual([REF]);
    expect(merged.snakes[0].photos[0].photoId).toBe('3f9a1c');
    expect(merged.snakes[0].imageUrl).toBe(REF);
  });

  it('the stored copy wins over the same photo still inline on another device', () => {
    // A device that restored an old backup still holds the bytes under the same entry id.
    const local = hatchling({ imageUrl: PHOTO_URL, photos: [photo] });
    const cloud = hatchling({ imageUrl: REF, photos: [stored] });
    const merged = mergeBreederSnapshots({ snakes: [local], pairings: [] }, { snakes: [cloud], pairings: [] });
    expect(merged.snakes[0].photos.map(p => p.url)).toEqual([REF]);
    expect(merged.snakes[0].imageUrl).toBe(REF);
  });

  it('an inline photo left out of the upload is not recorded as removed beside a reference', () => {
    // Half migrated: one photo uploaded, one still on the device.
    const second = { id: 'photo-second', url: PHOTO_URL, name: 'second.jpg', addedAt: '2026-08-25T04:09:51.788Z' };
    const upload = prepareAnimalForBackend(hatchling({ imageUrl: REF, photos: [stored, second] }));
    expect(upload.photos.map(p => p.id)).toEqual([stored.id]);
    expect(upload.removedEntries).toBeUndefined();
  });
});
