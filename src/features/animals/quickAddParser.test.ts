import { describe, expect, it } from 'vitest';
import { parseAnimalText } from './quickAddParser';

const genetics = [
  'BEL',
  'Clown',
  'GHI',
  'Monsoon',
];

describe('parseAnimalText', () => {
  it('keeps plain het genes in the het list', () => {
    const parsed = parseAnimalText('0,1 Bel clown ghi het monsoon', genetics);

    expect(parsed.sex).toBe('F');
    expect(parsed.morphs).toEqual(expect.arrayContaining(['BEL', 'Clown', 'GHI']));
    expect(parsed.hets).toEqual(['Het Monsoon']);
  });

  it('keeps percentage het genes in the het list', () => {
    const parsed = parseAnimalText('female clown 66% het monsoon 50% het pied', [
      ...genetics,
      'Pied',
    ]);

    expect(parsed.sex).toBe('F');
    expect(parsed.morphs).toContain('Clown');
    expect(parsed.hets).toEqual(expect.arrayContaining(['66% Het Monsoon', '50% Het Pied']));
  });
});
