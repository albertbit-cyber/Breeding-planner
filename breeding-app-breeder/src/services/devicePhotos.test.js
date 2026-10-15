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
