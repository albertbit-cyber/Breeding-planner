import { describe, expect, it } from 'vitest';
import { mergeBreederSnapshots } from '../App.jsx';
import { DEMO_ANIMALS } from './demoAnimals';

describe('a saved animal that shares a demo id', () => {
  it('replaces the local demo instead of being hidden as one', () => {
    // A fresh device starts on the demo collection. A keeper's own 2025 "Athena" is
    // 25Ath-1 too; the merge used to keep the demo flag and drop her from the list.
    const demoAthena = DEMO_ANIMALS.find(animal => animal.id === '25Ath-1');
    const savedAthena = {
      id: '25Ath-1',
      name: 'Athena',
      species: 'ball-python',
      sex: 'F',
      morphs: ['Pied'],
      hets: [],
      possibleHets: [],
      tags: [],
      groups: [],
      logs: {},
    };

    const merged = mergeBreederSnapshots(
      { snakes: DEMO_ANIMALS, pairings: [] },
      { snakes: [savedAthena], pairings: [] },
    );

    expect(demoAthena).toBeTruthy();
    expect(merged.snakes).toHaveLength(1);
    expect(merged.snakes[0].name).toBe('Athena');
    expect(merged.snakes[0].isDemo).not.toBe(true);
    // Nothing from the demo leaks into the real record.
    expect(merged.snakes[0].morphs).toEqual(['Pied']);
    expect(merged.snakes[0].tags).toEqual([]);
  });
});
