import { afterAll, describe, expect, it } from 'vitest';
import { DEMO_ANIMALS } from './demoAnimals';
import { DEFAULT_SPECIES_ID, getSpeciesById, speciesHasGeneDatabase } from '../genetics/speciesRegistry';
import { getGeneByName, setActiveSpecies } from '../genetics/geneDatabase';

afterAll(async () => {
  await setActiveSpecies(DEFAULT_SPECIES_ID);
});

const speciesIds = [...new Set(DEMO_ANIMALS.map(animal => animal.species))];

describe('demo collection', () => {
  it('stays a small taster spread across several species', () => {
    // Small on purpose: enough that the dashboard is never a single card, few enough that it
    // reads as an example rather than someone else's collection.
    expect(DEMO_ANIMALS.length).toBeLessThanOrEqual(6);
    expect(speciesIds.length).toBeGreaterThanOrEqual(3);
    speciesIds.forEach((speciesId) => {
      expect(
        DEMO_ANIMALS.some(animal => animal.species === speciesId),
        `${speciesId} is listed but has no demo animal`
      ).toBe(true);
    });
  });

  it('marks every animal as demo, in the record and in the name', () => {
    DEMO_ANIMALS.forEach((animal) => {
      // The flag drives the lifecycle; the name is what a keeper actually sees on a card.
      expect(animal.isDemo, `${animal.name} is not flagged as demo`).toBe(true);
      expect(animal.name).toMatch(/DEMO/);
    });
  });

  it('gives every animal a real species with a gene table', () => {
    speciesIds.forEach((speciesId) => {
      expect(getSpeciesById(speciesId), `unknown species "${speciesId}"`).not.toBeNull();
      // A demo animal of a species with no morph data would show an empty genetics picker,
      // which is exactly the "app looks broken" first impression demos exist to prevent.
      expect(speciesHasGeneDatabase(speciesId), `${speciesId} has no gene table`).toBe(true);
    });
  });

  it('uses only genes that exist in that animal\'s own species table', async () => {
    for (const speciesId of speciesIds) {
      await setActiveSpecies(speciesId);
      DEMO_ANIMALS.filter(animal => animal.species === speciesId).forEach((animal) => {
        [...(animal.morphs || []), ...(animal.hets || []), ...(animal.possibleHets || [])]
          .forEach((gene) => {
            expect(
              getGeneByName(gene),
              `"${gene}" on ${animal.name} is not a ${getSpeciesById(speciesId)?.name} gene`
            ).not.toBeNull();
          });
      });
    }
  });

  it('has unique ids, so a demo cannot collide with another demo', () => {
    const ids = DEMO_ANIMALS.map(animal => animal.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
