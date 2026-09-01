/**
 * The tree used to read the first half of a "Dam x Sire" name as the sire, so every
 * name-inferred animal had its parents swapped -- and the clutch id it rebuilt from that pair
 * came back reversed as well. These lock the order down.
 */
import { describe, it, expect } from 'vitest';
import { inferParentsForLocalSnake } from './FamilyTreePage.jsx';

const dam = { id: 'F1', name: 'Runa', sex: 'F', groups: ['Breeders'] };
const sire = { id: 'M1', name: 'Confusion Lesser Pastel het Clown', sex: 'M', groups: ['Breeders'] };

describe('inferParentsForLocalSnake', () => {
  it('reads the dam from the first half of the name and the sire from the second', () => {
    const child = { id: 'C1', name: 'Runa × Confusion Lesser Pastel het Clown - 4', sex: 'F' };
    const result = inferParentsForLocalSnake(child, [dam, sire, child]);
    expect(result.dam?.id).toBe('F1');
    expect(result.sire?.id).toBe('M1');
  });

  it('rebuilds the clutch id in the order the name was written', () => {
    const child = { id: 'C1', name: '26 Runa x Confusion Lesser Pastel het Clown - 4', sex: 'F' };
    const result = inferParentsForLocalSnake(child, [dam, sire, child]);
    expect(result.clutchId).toBe('Runa x Confusion Lesser Pastel het Clown 2026');
  });

  it('keeps recorded parent ids in preference to anything read from the name', () => {
    const child = { id: 'C1', name: 'Runa × Confusion Lesser Pastel het Clown - 4', sex: 'F', damId: 'F1', sireId: 'M1' };
    const result = inferParentsForLocalSnake(child, [dam, sire, child]);
    expect(result.dam?.id).toBe('F1');
    expect(result.sire?.id).toBe('M1');
  });
});
