import { describe, expect, it } from 'vitest';
import { animalCapFrom, checkAnimalCap, describeAnimalCap, nextTierForAnimals } from './animalCap';

const TIERS = [
  { key: 'breeder', name: 'Breeder', sortOrder: 4, features: [{ featureKey: 'animals.create', enabled: true, limitValue: 500 }] },
  { key: 'free', name: 'Free', sortOrder: 1, features: [{ featureKey: 'animals.create', enabled: true, limitValue: 20 }] },
  { key: 'hobby', name: 'Hobby', sortOrder: 2, features: [{ featureKey: 'animals.create', enabled: true, limitValue: 100 }] },
  { key: 'legacy', name: 'Legacy', sortOrder: 0, archivedAt: '2026-01-01', features: [{ featureKey: 'animals.create', enabled: true, limitValue: 50 }] },
];

const FREE_ACCESS = { allowed: true, featureKey: 'animals.create', tier: 'Free', currentUsage: 0, limit: 20 };
const free = animalCapFrom(FREE_ACCESS);
const hobby = nextTierForAnimals(TIERS, 20);

describe('animalCapFrom', () => {
  it('reads the limit and tier name from a cached access answer', () => {
    expect(free).toEqual({ limit: 20, tierName: 'Free' });
  });

  it('reads the tier from a usage-limit denial, which names it currentTier', () => {
    expect(animalCapFrom({ allowed: false, reason: 'Usage limit reached', currentTier: 'Free', limit: 20 }))
      .toEqual({ limit: 20, tierName: 'Free' });
  });

  it('has no cap when the account has no limit or nothing was fetched', () => {
    expect(animalCapFrom(null)).toBeNull();
    expect(animalCapFrom({ allowed: true, tier: 'Breeder Pro', limit: null })).toBeNull();
    expect(animalCapFrom({ allowed: true, source: 'unconfigured', tier: 'Unconfigured' })).toBeNull();
  });
});

describe('nextTierForAnimals', () => {
  it('offers the cheapest live tier that holds more', () => {
    expect(hobby).toEqual({ name: 'Hobby', key: 'hobby', limit: 100, sortOrder: 2 });
  });

  it('counts a tier with no limit as holding more', () => {
    const unlimited = [{ key: 'pro', name: 'Pro', sortOrder: 9, features: [{ featureKey: 'animals.create', enabled: true, limitValue: null }] }];
    expect(nextTierForAnimals(unlimited, 500)).toMatchObject({ name: 'Pro', limit: null });
  });

  it('offers nothing when no tier holds more', () => {
    expect(nextTierForAnimals(TIERS, 500)).toBeNull();
  });
});

describe('checkAnimalCap', () => {
  it('blocks a 60-animal import on an empty Free account and says how many rows to skip', () => {
    const result = checkAnimalCap({ cap: free, currentCount: 0, adding: 60, nextTier: hobby });
    expect(result).toMatchObject({ blocked: true, room: 20, total: 60 });
    expect(describeAnimalCap(result, { context: 'import' })).toEqual({
      tone: 'blocked',
      text: 'Free keeps 20 animals. This import adds 60 to your 0, and there is room for 20. Set 40 more rows to Skip, or upgrade.',
      upgrade: 'Upgrade to Hobby for up to 100.',
    });
  });

  it('lets an import through once enough rows are skipped', () => {
    const result = checkAnimalCap({ cap: free, currentCount: 0, adding: 20, nextTier: hobby });
    expect(result.blocked).toBe(false);
    expect(describeAnimalCap(result, { context: 'import' })).toMatchObject({
      tone: 'warning',
      text: 'Free keeps 20 animals. This makes 20 of 20.',
    });
  });

  it('tells a pasted list to lose lines rather than skip rows it does not have', () => {
    const result = checkAnimalCap({ cap: free, currentCount: 15, adding: 10, nextTier: hobby });
    expect(describeAnimalCap(result, { context: 'paste' }).text)
      .toBe('Free keeps 20 animals. This import adds 10 to your 15, and there is room for 5. Remove 5 lines from the list, or upgrade.');
  });

  it('says plainly when an import has no room at all', () => {
    const result = checkAnimalCap({ cap: free, currentCount: 20, adding: 3, nextTier: hobby });
    expect(describeAnimalCap(result, { context: 'import' }).text)
      .toBe('Free keeps 20 animals. You already have 20, so none of these 3 new animals fit. Set them to Skip, or upgrade.');
  });

  it('blocks the 21st animal and names the upgrade', () => {
    const result = checkAnimalCap({ cap: free, currentCount: 20, adding: 1, nextTier: hobby });
    expect(result).toMatchObject({ blocked: true, atCap: true });
    expect(describeAnimalCap(result, { context: 'add' })).toEqual({
      tone: 'blocked',
      text: "Free keeps 20 animals. You have 20, so this one can't be added.",
      upgrade: 'Upgrade to Hobby for up to 100.',
    });
  });

  it('shows where a keeper stands before the wall', () => {
    const result = checkAnimalCap({ cap: free, currentCount: 17, adding: 1, nextTier: hobby });
    expect(result.blocked).toBe(false);
    expect(describeAnimalCap(result)).toMatchObject({ tone: 'info', text: 'Free keeps 20 animals. This makes 18 of 20.' });
  });

  it('never blocks an import that only updates animals already in the collection', () => {
    expect(checkAnimalCap({ cap: free, currentCount: 60, adding: 0 }).blocked).toBe(false);
  });

  it('stays out of the way without a cap', () => {
    expect(checkAnimalCap({ cap: null, currentCount: 600, adding: 60 })).toBeNull();
    expect(describeAnimalCap(null)).toBeNull();
  });
});
