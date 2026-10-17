import { describe, expect, it } from 'vitest';
import {
  animalCardOf,
  cleanHandleInput,
  describeSplit,
  handleInputProblem,
  initialsOf,
  isPermanentKind,
  partnerShareCount,
  projectAnimals,
  transferableAnimals,
} from './networkFormat.js';

describe('handles as typed', () => {
  it('drop the @, lower-case and lose spaces', () => {
    expect(cleanHandleInput('  @Alice Pythons ')).toBe('alicepythons');
  });

  it('are checked like the server checks them', () => {
    expect(handleInputProblem('')).toBe('empty');
    expect(handleInputProblem('ab')).toBe('short');
    expect(handleInputProblem('9lives')).toBe('characters');
    expect(handleInputProblem('ali..ce')).toBe('characters');
    expect(handleInputProblem('alice.')).toBe('characters');
    expect(handleInputProblem('a'.repeat(25))).toBe('long');
    expect(handleInputProblem('alice_pythons.de')).toBeNull();
  });
});

describe('which animals can be offered', () => {
  const animals = [
    { id: 'a', sex: 'M', status: 'Active' },
    { id: 'b', sex: 'F', status: 'Sold' },
    { id: 'c', sex: 'F', status: 'On loan', loanedTo: { toHandle: 'bob' } },
    { id: 'd', sex: 'M', status: 'Partner', partnerRecord: { ownerHandle: 'alice' } },
    { id: 'e', sex: 'F', status: 'On loan', loan: { role: 'borrowed' } },
    { id: 'f', sex: 'U', status: 'Active' },
    { id: 'g', sex: 'Female', status: 'Holdback' },
    { id: 'h', sex: 'M', status: 'Active', isDemo: true },
  ];

  it('only the keeper\'s own animals still in the collection', () => {
    expect(transferableAnimals(animals).map((a) => a.id)).toEqual(['a', 'f', 'g']);
  });

  it('a project needs a sexed animal, of the asked sex when given', () => {
    expect(projectAnimals(animals).map((a) => a.id)).toEqual(['a', 'g']);
    expect(projectAnimals(animals, 'F').map((a) => a.id)).toEqual(['g']);
  });

  it('a status tagged On loan without a loan record is still the keeper\'s own', () => {
    expect(transferableAnimals([{ id: 'x', status: 'On loan' }]).map((a) => a.id)).toEqual(['x']);
  });
});

describe('snake cards', () => {
  it('carry only a web photo, never a device-local one', () => {
    const card = animalCardOf({ id: '26-M-1', name: 'Apollo', photos: ['https://cdn/x.jpg', 'data:image/png;base64,AA'], notes: 'secret', price: 900 });
    expect(card).toMatchObject({ appAnimalId: '26-M-1', name: 'Apollo', imageUrl: 'https://cdn/x.jpg' });
    expect(card).not.toHaveProperty('notes');
    expect(card).not.toHaveProperty('price');
    expect(animalCardOf({ id: 'z', photos: ['photo:abc'] }).imageUrl).toBeNull();
  });
});

describe('the split', () => {
  it('reads as one sentence', () => {
    expect(describeSplit({ method: 'percentage', maleOwnerShare: 40 }, 'Alice', 'Bob')).toBe('Alice 40%, Bob 60%.');
    expect(describeSplit({ method: 'alternate_picks', firstPick: 'female_owner' }, 'Alice', 'Bob')).toBe('Alternate picks, Bob first.');
    expect(describeSplit({ method: 'custom', note: 'Bob keeps the pied' }, 'Alice', 'Bob')).toBe('Bob keeps the pied');
  });

  it('says how many hatchlings go to the partner when the terms give a number', () => {
    expect(partnerShareCount({ method: 'percentage', maleOwnerShare: 50 }, 7)).toBe(4);
    expect(partnerShareCount({ method: 'fixed_count', maleOwnerShare: 9 }, 6)).toBe(6);
    expect(partnerShareCount({ method: 'alternate_picks', firstPick: 'male_owner' }, 5)).toBe(3);
    expect(partnerShareCount({ method: 'alternate_picks', firstPick: 'female_owner' }, 5)).toBe(2);
    expect(partnerShareCount({ method: 'custom', note: 'x' }, 5)).toBeNull();
  });
});

describe('small things', () => {
  it('initials come from the display name', () => {
    expect(initialsOf({ displayName: "Alice's Pythons" })).toBe('AP');
    expect(initialsOf({ handle: 'bob' })).toBe('BO');
  });

  it('a loan is the only temporary kind', () => {
    expect(['sale', 'gift', 'trade', 'split'].every(isPermanentKind)).toBe(true);
    expect(isPermanentKind('loan')).toBe(false);
  });
});
