import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SPECIES_ID,
  getSpeciesById,
  listSpecies,
  listSpeciesGroups,
  resolveSpeciesId,
  speciesHasGeneDatabase,
} from './speciesRegistry';
import {
  getActiveSpeciesId,
  getAllGenes,
  getGeneByName,
  getGeneDatabaseGeneration,
  getDefaultGeneAliasRows,
  resolveActiveGeneAliasToken,
  setActiveGeneAliasRows,
  setActiveSpecies,
} from './geneDatabase';
import { getGeneGroups, inferMorphType } from './geneLibrary';

// Every test leaves the module-level active species where it found it -- these are shared
// singletons, so a test that switched species and did not switch back would corrupt the
// ones that run after it.
afterEach(async () => {
  await setActiveSpecies(DEFAULT_SPECIES_ID);
  setActiveGeneAliasRows(getDefaultGeneAliasRows());
});

describe('species registry', () => {
  it('lists the generated taxonomy and finds species by id', () => {
    expect(listSpecies().length).toBeGreaterThan(20);
    expect(listSpeciesGroups().some(group => group.id === 'pythons')).toBe(true);
    expect(getSpeciesById('crested-gecko')?.name).toBe('Crested Geckos');
    expect(getSpeciesById('not-a-species')).toBeNull();
  });

  it('reports which species carry a gene table', () => {
    expect(speciesHasGeneDatabase('ball-python')).toBe(true);
    // Morphpedia publishes no traits for tegus. That is a normal state, not a data gap.
    expect(speciesHasGeneDatabase('tegu')).toBe(false);
  });

  it('resolves unknown and missing species to ball python', () => {
    // Animals synced before the species column existed carry null, and the backend leaves
    // that null rather than guessing -- the fallback has to live here.
    expect(resolveSpeciesId(null)).toBe(DEFAULT_SPECIES_ID);
    expect(resolveSpeciesId('')).toBe(DEFAULT_SPECIES_ID);
    expect(resolveSpeciesId('not-a-species')).toBe(DEFAULT_SPECIES_ID);
    expect(resolveSpeciesId('corn-snake')).toBe('corn-snake');
  });
});

describe('active species', () => {
  it('starts on ball python so the app boots with a gene database', () => {
    expect(getActiveSpeciesId()).toBe(DEFAULT_SPECIES_ID);
    expect(getGeneByName('Pastel')?.geneType).toBe('incomplete_dominant');
  });

  it('swaps the whole gene table when the species changes', async () => {
    await setActiveSpecies('crested-gecko');

    expect(getActiveSpeciesId()).toBe('crested-gecko');
    expect(getGeneByName('Cappuccino')?.geneType).toBe('incomplete_dominant');
    // Pastel is a ball python gene. Leaving it resolvable under crested geckos would let a
    // keeper record a gene the animal cannot carry, and a cross would then predict it.
    expect(getGeneByName('Pastel')).toBeNull();
    expect(getAllGenes().some(gene => gene.geneName === 'Banana')).toBe(false);
  });

  it('restores the previous species on switching back', async () => {
    await setActiveSpecies('crested-gecko');
    await setActiveSpecies(DEFAULT_SPECIES_ID);

    expect(getGeneByName('Pastel')?.geneType).toBe('incomplete_dominant');
    expect(getGeneByName('Cappuccino')).toBeNull();
  });

  it('gives species with no published traits an empty but usable database', async () => {
    await setActiveSpecies('tegu');

    expect(getActiveSpeciesId()).toBe('tegu');
    expect(getAllGenes()).toEqual([]);
    expect(getGeneByName('Pastel')).toBeNull();
  });

  it('falls back to ball python rather than leaving the app with no database', async () => {
    const settled = await setActiveSpecies('not-a-species');
    expect(settled).toBe(DEFAULT_SPECIES_ID);
    expect(getGeneByName('Pastel')).not.toBeNull();
  });

  it('bumps the generation so derived caches rebuild', async () => {
    const before = getGeneDatabaseGeneration();
    await setActiveSpecies('corn-snake');
    expect(getGeneDatabaseGeneration()).toBeGreaterThan(before);
  });
});

describe('derived tables follow the active species', () => {
  it('rebuilds gene groups and morph-type inference', async () => {
    expect(inferMorphType('Pastel')).toBe('co-dom');

    await setActiveSpecies('crested-gecko');

    const groups = getGeneGroups();
    expect(groups['Incomplete Dominant']).toContain('Cappuccino');
    expect(groups['Incomplete Dominant'] || []).not.toContain('Pastel');
    expect(inferMorphType('Cappuccino')).toBe('co-dom');
    // Unknown to this species, so it must not classify as anything but the catch-all.
    expect(inferMorphType('Banana')).toBe('polygenic');
  });

  it('only offers the Axanthic catch-all where the species has lines to be unsure between', async () => {
    expect(getGeneGroups().Recessive).toContain('Axanthic');

    // Crested geckos have a real Axanthic gene, so it appears on its own merit...
    await setActiveSpecies('crested-gecko');
    expect(getGeneByName('Axanthic')).not.toBeNull();

    // ...but a species with neither the gene nor the lines must not be offered it.
    await setActiveSpecies('tegu');
    expect(getGeneGroups().Recessive || []).not.toContain('Axanthic');
  });

  it('resolves shorthand only against the active species', async () => {
    expect(resolveActiveGeneAliasToken('YB')).toBe('Yellow Belly');

    await setActiveSpecies('crested-gecko');
    // "YB" is ball python shorthand. Still resolving it here would invent a gene.
    expect(resolveActiveGeneAliasToken('YB')).toBeNull();
  });

  it("keeps the keeper's own aliases across a species switch", async () => {
    setActiveGeneAliasRows([{ geneName: 'Cappuccino', aliases: [], shorthand: ['CAP'] }]);
    await setActiveSpecies('crested-gecko');

    expect(resolveActiveGeneAliasToken('CAP')).toBe('Cappuccino');
  });
});
