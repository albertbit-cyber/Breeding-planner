import { afterEach, describe, expect, it } from 'vitest';
import { buildQuickAddGeneticsSource } from './quickAddGenetics';
import { parseAnimalText } from './quickAddParser';
import { DEFAULT_SPECIES_ID } from '../../genetics/speciesRegistry';
import { setActiveSpecies } from '../../genetics/geneDatabase';

// A ball-python-heavy collection with a single crested gecko in it. This is the shape that
// produced the bug: live genetics were harvested from every animal regardless of species.
const COLLECTION = [
  { id: 'bp-1', species: 'ball-python', morphs: ['Pastel', 'Clown'], hets: ['Hypo'] },
  { id: 'bp-2', species: 'ball-python', morphs: ['Banana', 'Spider'], hets: [] },
  { id: 'bp-3', species: 'ball-python', morphs: ['Piebald'], hets: [] },
  { id: 'cg-1', species: 'crested-gecko', morphs: ['Harlequin'], hets: [] },
  { id: 'legacy', species: undefined, morphs: ['Enchi'], hets: [] },
];

const names = (source: ReturnType<typeof buildQuickAddGeneticsSource>) =>
  source.map((entry: any) => String(entry?.name || '')).filter(Boolean);

afterEach(async () => {
  await setActiveSpecies(DEFAULT_SPECIES_ID);
});

describe('quick add vocabulary', () => {
  it('is empty until a species is known', () => {
    // Falling back to the previous species' genes is the leak; an empty list is the honest
    // answer, and the caller refuses to parse in this state.
    expect(buildQuickAddGeneticsSource(COLLECTION, [], [], '')).toEqual([]);
  });

  it('offers ball python genes for ball pythons', async () => {
    await setActiveSpecies('ball-python');
    const vocabulary = names(buildQuickAddGeneticsSource(COLLECTION, [], [], 'ball-python'));
    expect(vocabulary).toContain('Pastel');
    expect(vocabulary).toContain('Clown');
  });

  it('never offers another species\' genes, even when the collection is full of them', async () => {
    await setActiveSpecies('crested-gecko');
    const vocabulary = names(buildQuickAddGeneticsSource(COLLECTION, [], [], 'crested-gecko'));

    expect(vocabulary).toContain('Harlequin');
    expect(vocabulary).toContain('Cappuccino');
    // These are on animals in the same collection, but they are ball python genes. Offering
    // them would let a keeper record a crested gecko carrying a gene it cannot have.
    ['Pastel', 'Clown', 'Banana', 'Spider', 'Piebald', 'Enchi'].forEach((gene) => {
      expect(vocabulary, `${gene} leaked into the crested gecko vocabulary`).not.toContain(gene);
    });
  });

  it('does not let a legacy animal with no species leak into another species', async () => {
    // Animals recorded before species tracking resolve to ball python, so Enchi belongs to
    // ball pythons and must not appear anywhere else.
    await setActiveSpecies('corn-snake');
    const vocabulary = names(buildQuickAddGeneticsSource(COLLECTION, [], [], 'corn-snake'));
    expect(vocabulary).not.toContain('Enchi');
    expect(vocabulary).toContain('Amelanistic');
  });

  it('parses crested gecko text without inventing ball python genes', async () => {
    await setActiveSpecies('crested-gecko');
    const vocabulary = buildQuickAddGeneticsSource(COLLECTION, [], [], 'crested-gecko');

    const parsed = parseAnimalText('CG-24-004 0.1 harlequin cappuccino pastel 52g', vocabulary);

    expect(parsed.morphs).toContain('Harlequin');
    expect(parsed.morphs).toContain('Cappuccino');
    expect(parsed.morphs).not.toContain('Pastel');
    expect(parsed.sex).toBe('F');
    expect(parsed.weight).toBe(52);
  });

  it('still reads sex, weight and date for a species with no gene table', async () => {
    await setActiveSpecies('tegu');
    const vocabulary = buildQuickAddGeneticsSource(COLLECTION, [], [], 'tegu');
    expect(vocabulary).toEqual([]);

    const parsed = parseAnimalText('TG-24-001 1.0 2400g born 2024', vocabulary);

    expect(parsed.sex).toBe('M');
    expect(parsed.weight).toBe(2400);
    expect(parsed.hatchYear).toBe(2024);
    expect(parsed.morphs).toEqual([]);
  });
});
