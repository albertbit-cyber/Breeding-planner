import { describe, expect, it } from 'vitest';
import {
  MAX_PHOTOS_PER_ANIMAL,
  checkPhotoCap,
  describePhotoCap,
  describePhotoCount,
  nextTierForPhotos,
  photoCapFrom,
} from './photoCap';

const photos = (limitValue, enabled = true) => [{ featureKey: 'animals.photos', enabled, limitValue }];
const TIERS = [
  { key: 'breeder', name: 'Breeder', sortOrder: 4, features: photos(9) },
  { key: 'free', name: 'Free', sortOrder: 1, features: photos(3) },
  { key: 'hobby', name: 'Hobby', sortOrder: 2, features: photos(5) },
  { key: 'hobby_plus', name: 'Hobby Plus', sortOrder: 3, features: photos(7) },
  { key: 'professional_breeder', name: 'Professional Breeder', sortOrder: 5, features: photos(null) },
  { key: 'lab_partner', name: 'Lab', sortOrder: 6, features: photos(null, false) },
  { key: 'old', name: 'Old', sortOrder: 0, archivedAt: '2026-01-01', features: photos(4) },
];
const FREE = { allowed: true, featureKey: 'animals.photos', tier: 'Free', currentUsage: 0, limit: 3 };

describe('photoCapFrom', () => {
  it('takes the tier number per animal', () => {
    expect(photoCapFrom(FREE)).toEqual({ limit: 3, tierName: 'Free', tierLimited: true });
  });

  it('falls back to the technical cap when the limit is unknown or unlimited', () => {
    expect(photoCapFrom(null)).toEqual({ limit: MAX_PHOTOS_PER_ANIMAL, tierName: '', tierLimited: false });
    expect(photoCapFrom({ allowed: true, tier: 'Enterprise', limit: null })).toMatchObject({ limit: MAX_PHOTOS_PER_ANIMAL, tierLimited: false });
    expect(photoCapFrom({ allowed: true, source: 'unconfigured' })).toMatchObject({ limit: MAX_PHOTOS_PER_ANIMAL });
  });

  it('holds a plan without photos at zero', () => {
    expect(photoCapFrom({ allowed: false, reason: 'Feature is not included in the current tier', currentTier: 'Lab' })).toEqual({ limit: 0, tierName: 'Lab', tierLimited: true });
  });
});

describe('nextTierForPhotos', () => {
  it('names the cheapest public tier with more photos per animal', () => {
    expect(nextTierForPhotos(TIERS, 3)).toMatchObject({ name: 'Hobby', limit: 5 });
    expect(nextTierForPhotos(TIERS, 7)).toMatchObject({ name: 'Breeder', limit: 9 });
    expect(nextTierForPhotos(TIERS, 9)).toMatchObject({ name: 'Professional Breeder', limit: null });
  });
});

describe('checkPhotoCap', () => {
  const cap = photoCapFrom(FREE);

  it('says how many of a selection fit', () => {
    expect(checkPhotoCap({ cap, current: 1, adding: 4 })).toMatchObject({ room: 2, accepted: 2, refused: 2, full: false });
  });

  it('is full at the limit and over it after a downgrade, without asking for anything back', () => {
    expect(checkPhotoCap({ cap, current: 3, adding: 1 })).toMatchObject({ accepted: 0, refused: 1, full: true, over: 0 });
    expect(checkPhotoCap({ cap, current: 8 })).toMatchObject({ full: true, over: 5, room: 0 });
  });

  it('offers no upgrade against the technical cap', () => {
    const technical = checkPhotoCap({ cap: photoCapFrom(null), current: 60, nextTier: { name: 'X', limit: null } });
    expect(technical.nextTier).toBeNull();
  });
});

describe('wording', () => {
  const cap = photoCapFrom(FREE);
  const next = nextTierForPhotos(TIERS, 3);

  it('counts', () => {
    expect(describePhotoCount(checkPhotoCap({ cap, current: 2 }))).toBe('2 of 3 photos');
  });

  it('says nothing while there is room', () => {
    expect(describePhotoCap(checkPhotoCap({ cap, current: 1, adding: 2 }))).toBeNull();
  });

  it('explains a full animal with the next tier', () => {
    expect(describePhotoCap(checkPhotoCap({ cap, current: 3, adding: 1, nextTier: next }))).toEqual({
      tone: 'blocked',
      text: 'Free keeps 3 photos per animal. This one has 3. Remove one to add another.',
      upgrade: 'Upgrade to Hobby for 5 per animal.',
    });
  });

  it('explains a selection that only partly fit', () => {
    expect(describePhotoCap(checkPhotoCap({ cap, current: 1, adding: 4, nextTier: next }))).toMatchObject({
      tone: 'warning',
      text: 'Free keeps 3 photos per animal. The first 2 were added; 2 did not fit.',
    });
  });

  it('keeps an animal over the limit whole', () => {
    expect(describePhotoCap(checkPhotoCap({ cap, current: 6, nextTier: next })).text)
      .toBe('Free keeps 3 photos per animal. This one has 6 and keeps them all. Remove photos to get under the limit before adding another.');
  });

  it('names the unlimited tier and the plan without photos', () => {
    const breeder = photoCapFrom({ ...FREE, tier: 'Breeder', limit: 9 });
    expect(describePhotoCap(checkPhotoCap({ cap: breeder, current: 9, nextTier: nextTierForPhotos(TIERS, 9) })).upgrade)
      .toBe('Upgrade to Professional Breeder for no photo limit.');
    expect(describePhotoCap(checkPhotoCap({ cap: { limit: 0, tierName: 'Lab', tierLimited: true }, current: 0 })).text)
      .toBe('Lab does not include animal photos.');
  });
});
