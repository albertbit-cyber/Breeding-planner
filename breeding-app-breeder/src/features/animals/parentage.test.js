import { describe, it, expect } from 'vitest';
import {
  splitPairLabel,
  findAnimalByName,
  detectParentsFromName,
  isBreederAnimal,
  isBreederGroupName,
} from './parentage';

const collection = [
  { id: 'F1', name: 'Cinnamon Clown', sex: 'F' },
  { id: 'M1', name: 'Hydra Butterhead Clown', sex: 'M' },
  { id: 'F2', name: 'Runa', sex: 'F' },
  { id: 'M2', name: 'Confusion Lesser Pastel het Clown', sex: 'M' },
];

describe('splitPairLabel', () => {
  it('splits the keeper-typed form, dam first', () => {
    expect(splitPairLabel('Cinnamon Clown X Hydra Butterhead Clown')).toEqual({
      damName: 'Cinnamon Clown',
      sireName: 'Hydra Butterhead Clown',
    });
  });

  it('splits the generated name and drops the hatchling index', () => {
    expect(splitPairLabel('Runa × Confusion Lesser Pastel het Clown - 4')).toEqual({
      damName: 'Runa',
      sireName: 'Confusion Lesser Pastel het Clown',
    });
  });

  it('splits a clutch id and drops the trailing year', () => {
    expect(splitPairLabel('Runa x Confusion Lesser Pastel het Clown 2026')).toEqual({
      damName: 'Runa',
      sireName: 'Confusion Lesser Pastel het Clown',
    });
  });

  it('handles the legacy parenthesised hatchling name', () => {
    expect(splitPairLabel('Hatchling 4 (Runa × Confusion Lesser Pastel het Clown)')).toEqual({
      damName: 'Runa',
      sireName: 'Confusion Lesser Pastel het Clown',
    });
  });

  it('returns null for a name that is not a pair', () => {
    expect(splitPairLabel('Cinnamon Clown')).toBeNull();
    expect(splitPairLabel('')).toBeNull();
    expect(splitPairLabel(null)).toBeNull();
  });

  it('refuses an ambiguous label with more than one separator', () => {
    expect(splitPairLabel('A × B × C')).toBeNull();
  });

  it('does not split on an x inside a word', () => {
    expect(splitPairLabel('Axanthic Clown')).toBeNull();
  });

  it('is not confused by leftover state from a previous call', () => {
    splitPairLabel('Runa × Confusion Lesser Pastel het Clown');
    expect(splitPairLabel('Runa × Confusion Lesser Pastel het Clown')).toEqual({
      damName: 'Runa',
      sireName: 'Confusion Lesser Pastel het Clown',
    });
  });
});

describe('findAnimalByName', () => {
  it('matches on name and sex, ignoring case and spacing', () => {
    expect(findAnimalByName(collection, '  cinnamon   clown ', 'F')?.id).toBe('F1');
  });

  it('will not return an animal of the wrong sex for the role', () => {
    expect(findAnimalByName(collection, 'Cinnamon Clown', 'M')).toBeNull();
  });

  it('picks the animal whose sex fits when a name is shared', () => {
    const shared = [
      { id: 'A', name: 'Ghost', sex: 'F' },
      { id: 'B', name: 'Ghost', sex: 'M' },
    ];
    expect(findAnimalByName(shared, 'Ghost', 'M')?.id).toBe('B');
  });

  it('refuses to guess when two animals of the same sex share a name', () => {
    const duplicates = [
      { id: 'A', name: 'Ghost', sex: 'F' },
      { id: 'B', name: 'Ghost', sex: 'F' },
    ];
    expect(findAnimalByName(duplicates, 'Ghost', 'F')).toBeNull();
  });

  it('never matches the animal being edited', () => {
    expect(findAnimalByName(collection, 'Runa', 'F', 'F2')).toBeNull();
  });
});

describe('detectParentsFromName', () => {
  it('reads dam from the first half and sire from the second', () => {
    const result = detectParentsFromName({
      name: 'Cinnamon Clown X Hydra Butterhead Clown',
      animals: collection,
    });
    expect(result.dam?.id).toBe('F1');
    expect(result.sire?.id).toBe('M1');
  });

  it('returns the half it could resolve and leaves the other null', () => {
    const result = detectParentsFromName({
      name: 'Cinnamon Clown × Someone Not In The Collection',
      animals: collection,
    });
    expect(result.dam?.id).toBe('F1');
    expect(result.sire).toBeNull();
    expect(result.sireName).toBe('Someone Not In The Collection');
  });

  it('returns nothing for a name that is not a pair', () => {
    expect(detectParentsFromName({ name: 'Cinnamon Clown', animals: collection }))
      .toEqual({ dam: null, sire: null, damName: '', sireName: '' });
  });
});

describe('breeder group detection', () => {
  it('recognises how keepers actually name the group', () => {
    expect(isBreederGroupName('Breeders')).toBe(true);
    expect(isBreederGroupName('breeding stock')).toBe(true);
    expect(isBreederGroupName('Zuchttiere')).toBe(true);
    expect(isBreederGroupName('Holdbacks')).toBe(false);
  });

  it('reads the animal groups list', () => {
    expect(isBreederAnimal({ groups: ['Holdbacks', 'Breeders'] })).toBe(true);
    expect(isBreederAnimal({ groups: ['Holdbacks'] })).toBe(false);
    expect(isBreederAnimal({})).toBe(false);
  });
});
