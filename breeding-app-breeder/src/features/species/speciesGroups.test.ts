import { describe, expect, it } from 'vitest';
import {
  flattenGroupsBySpecies,
  mergeGroupsBySpecies,
  migrateFlatGroups,
  normalizeGroupNames,
  normalizeGroupsBySpecies,
} from './speciesGroups';

describe('group names', () => {
  it('trims, drops blanks and de-duplicates case-insensitively', () => {
    expect(normalizeGroupNames([' Breeders ', 'breeders', '', null, 'Holdbacks']))
      .toEqual(['Breeders', 'Holdbacks']);
  });

  it('treats a non-array as no groups rather than throwing', () => {
    expect(normalizeGroupNames(undefined)).toEqual([]);
    expect(normalizeGroupNames('Breeders' as unknown as string[])).toEqual([]);
  });
});

describe('migration from the flat list', () => {
  it('assigns pre-multi-species groups to ball python', () => {
    // Every animal recorded before species tracking resolves to ball python, so its groups
    // belong there -- with the animals that actually use them.
    const migrated = migrateFlatGroups(['Breeders', 'Holdbacks'], null);
    expect(migrated).toEqual({ 'ball-python': ['Breeders', 'Holdbacks'] });
  });

  it('leaves an existing per-species map alone', () => {
    const existing = { 'crested-gecko': ['Racks'] };
    expect(migrateFlatGroups(['Breeders'], existing)).toEqual({ 'crested-gecko': ['Racks'] });
  });

  it('produces no species at all when there is nothing to migrate', () => {
    expect(migrateFlatGroups([], null)).toEqual({});
    expect(migrateFlatGroups(null, null)).toEqual({});
  });
});

describe('species isolation', () => {
  it('keeps each species list separate, including identical names', () => {
    // Two species may both have a group called "Breeders". They are different groups.
    const map = normalizeGroupsBySpecies({
      'ball-python': ['Breeders', 'Holdbacks'],
      'crested-gecko': ['Breeders'],
    });
    expect(map['ball-python']).toEqual(['Breeders', 'Holdbacks']);
    expect(map['crested-gecko']).toEqual(['Breeders']);
  });

  it('never invents a list for a species that has none', () => {
    // A species new to the collection starts empty -- the keeper names their own.
    const map = normalizeGroupsBySpecies({ 'ball-python': ['Breeders'] });
    expect(map['corn-snake']).toBeUndefined();
  });
});

describe('legacy flat mirror', () => {
  it('unions every species so an older client still sees the names', () => {
    const flat = flattenGroupsBySpecies({
      'ball-python': ['Breeders', 'Holdbacks'],
      'crested-gecko': ['Breeders', 'Racks'],
    });
    expect(flat).toEqual(['Breeders', 'Holdbacks', 'Racks']);
  });
});

describe('sync merge', () => {
  it('unions each species independently so one device cannot clobber another', () => {
    const merged = mergeGroupsBySpecies(
      { 'ball-python': ['Breeders'], 'corn-snake': ['Rack A'] },
      { 'ball-python': ['Holdbacks'], 'crested-gecko': ['Shelf 1'] }
    );
    expect(merged['ball-python']).toEqual(['Breeders', 'Holdbacks']);
    expect(merged['corn-snake']).toEqual(['Rack A']);
    expect(merged['crested-gecko']).toEqual(['Shelf 1']);
  });

  it('does not leak one species\' groups into another', () => {
    const merged = mergeGroupsBySpecies(
      { 'ball-python': ['Breeders', 'Holdbacks'] },
      { 'crested-gecko': [] }
    );
    expect(merged['crested-gecko']).toEqual([]);
  });

  it('survives a payload from an older client that has no map at all', () => {
    expect(mergeGroupsBySpecies(undefined, { 'ball-python': ['Breeders'] }))
      .toEqual({ 'ball-python': ['Breeders'] });
    expect(mergeGroupsBySpecies(null, null)).toEqual({});
  });
});
