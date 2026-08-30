import { describe, expect, it } from 'vitest';
import { catalogGeneticsText, resolveCatalogParentLabel } from './catalogParentLabel';

// Stands in for App.jsx's resolveCatalogMorph: genetics string first, then tokens.
const resolveGenetics = (animal) => {
  if (typeof animal?.genetics === 'string' && animal.genetics.trim()) return animal.genetics.trim();
  return [...(animal?.morphs || []), ...(animal?.hets || [])].join(', ');
};

const mapOf = (...animals) => new Map(animals.map((animal) => [animal.id, animal]));

describe('catalogGeneticsText', () => {
  it('joins token arrays and trims the blanks out', () => {
    expect(catalogGeneticsText(['Pastel', '  ', 'het Clown'])).toBe('Pastel, het Clown');
  });

  it('passes strings through and treats nullish as empty', () => {
    expect(catalogGeneticsText('Pastel')).toBe('Pastel');
    expect(catalogGeneticsText(null)).toBe('');
    expect(catalogGeneticsText(undefined)).toBe('');
  });
});

describe('resolveCatalogParentLabel', () => {
  it('reads the live collection record, not the snapshot taken at hatch', () => {
    const sire = { id: 'S1', name: 'Apollo', genetics: 'Pastel, Clown' };
    const child = {
      id: 'C1',
      sireId: 'S1',
      sireName: 'Apollo (stale)',
      sireGenetics: ['Pastel', 'het Clown'],
      parentGenetics: { sire: { id: 'S1', name: 'Apollo', genetics: ['Pastel', 'het Clown'] } },
    };

    // The het proved out to visual Clown after the clutch was logged.
    expect(resolveCatalogParentLabel(child, 'sire', mapOf(sire), resolveGenetics))
      .toBe('Apollo — Pastel, Clown');
  });

  it('falls back to the snapshot when the parent has left the collection', () => {
    const child = {
      id: 'C1',
      sireId: 'GONE',
      parentGenetics: { sire: { id: 'S9', name: 'Atlas', genetics: ['Banana', 'het Pied'] } },
    };

    expect(resolveCatalogParentLabel(child, 'sire', mapOf(), resolveGenetics))
      .toBe('Atlas — Banana, het Pied');
  });

  it('reads metadata.parents when parentGenetics was never written', () => {
    const child = {
      id: 'C1',
      metadata: { parents: { dam: { name: 'Nyx', genetics: ['Mojave'] } } },
    };

    expect(resolveCatalogParentLabel(child, 'dam', null, resolveGenetics)).toBe('Nyx — Mojave');
  });

  it('uses the flat sireName/sireGenetics pair when there is no snapshot', () => {
    const child = { id: 'C1', damName: 'Vega', damGenetics: ['Enchi', 'het Albino'] };

    expect(resolveCatalogParentLabel(child, 'dam', null, resolveGenetics))
      .toBe('Vega — Enchi, het Albino');
  });

  it('keeps whichever half is known when the other is missing', () => {
    expect(resolveCatalogParentLabel({ sireName: 'Apollo' }, 'sire', null, resolveGenetics))
      .toBe('Apollo');
    expect(resolveCatalogParentLabel({ sireGenetics: ['Pastel'] }, 'sire', null, resolveGenetics))
      .toBe('Pastel');
  });

  it('names the parent by id when it was never given a name', () => {
    const sire = { id: '24-M-001', genetics: 'Pastel' };

    expect(resolveCatalogParentLabel({ sireId: '24-M-001' }, 'sire', mapOf(sire), resolveGenetics))
      .toBe('24-M-001 — Pastel');
  });

  it('returns empty for an animal with no parentage recorded', () => {
    expect(resolveCatalogParentLabel({ id: 'C1' }, 'sire', mapOf(), resolveGenetics)).toBe('');
    expect(resolveCatalogParentLabel(null, 'sire', mapOf(), resolveGenetics)).toBe('');
    expect(resolveCatalogParentLabel({ id: 'C1' }, 'cousin', mapOf(), resolveGenetics)).toBe('');
  });

  it('does not confuse the two roles', () => {
    const child = {
      sireName: 'Apollo',
      sireGenetics: ['Pastel'],
      damName: 'Nyx',
      damGenetics: ['Mojave'],
    };

    expect(resolveCatalogParentLabel(child, 'sire', null, resolveGenetics)).toBe('Apollo — Pastel');
    expect(resolveCatalogParentLabel(child, 'dam', null, resolveGenetics)).toBe('Nyx — Mojave');
  });
});
