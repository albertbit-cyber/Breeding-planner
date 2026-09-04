import { describe, it, expect } from 'vitest';
import { buildPedigree, clutchLabel, CONFIDENCE } from './pedigreeModel';

/**
 * A collection shaped like a real one: two sires, three dams, and clutches that overlap on a
 * parent so half-siblings actually exist to be tested.
 */
const SIRE_A = { id: 'M1', name: 'Confusion', sex: 'M', groups: ['Breeders'] };
const SIRE_B = { id: 'M2', name: 'Hydra', sex: 'M', groups: ['Breeders'] };
const DAM_A = { id: 'F1', name: 'Runa', sex: 'F', groups: ['Breeders'] };
const DAM_B = { id: 'F2', name: 'Nova', sex: 'F', groups: ['Breeders'] };

const hatchling = (id, extra) => ({ id, sex: 'U', ...extra });

describe('buildPedigree — parent resolution', () => {
  it('trusts recorded sireId/damId above everything else', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A, SIRE_B,
        // The name says Hydra, the record says Confusion. The record wins.
        hatchling('H1', { name: 'Runa x Hydra - 1', sireId: 'M1', damId: 'F1' }),
      ],
    });
    expect(model.parents('H1')).toMatchObject({
      sireId: 'M1',
      damId: 'F1',
      confidence: CONFIDENCE.RECORDED,
    });
  });

  it('falls back to the pairing the animal hatched from', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A, hatchling('H1', { name: 'Unnamed hatchling', pairingId: 'P1' })],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1' }],
    });
    expect(model.parents('H1')).toMatchObject({
      sireId: 'M1',
      damId: 'F1',
      confidence: CONFIDENCE.RECORDED,
    });
  });

  it('reads a well-formed name dam-first', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A, hatchling('H1', { name: 'Runa x Confusion - 3' })],
    });
    expect(model.parents('H1')).toMatchObject({
      sireId: 'M1',
      damId: 'F1',
      confidence: CONFIDENCE.INFERRED,
    });
  });

  it('leaves parents unset when a name is ambiguous rather than guessing', () => {
    const model = buildPedigree({
      animals: [
        { id: 'F1', name: 'Runa', sex: 'F' },
        { id: 'F9', name: 'Runa', sex: 'F' },
        SIRE_A,
        hatchling('H1', { name: 'Runa x Confusion - 1' }),
      ],
    });
    expect(model.parents('H1').damId).toBeNull();
    expect(model.parents('H1').sireId).toBe('M1');
  });

  it('ignores a parent id pointing at an animal that is not in the collection', () => {
    const model = buildPedigree({
      animals: [DAM_A, hatchling('H1', { name: 'Orphan', sireId: 'GONE', damId: 'F1' })],
    });
    expect(model.parents('H1')).toMatchObject({ sireId: null, damId: 'F1' });
  });
});

describe('buildPedigree — clutches and siblings', () => {
  it('groups full siblings of one clutch together', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A,
        hatchling('H1', { name: 'Runa x Confusion - 1', pairingId: 'P1', hatchlingIndex: 1 }),
        hatchling('H2', { name: 'Runa x Confusion - 2', pairingId: 'P1', hatchlingIndex: 2 }),
      ],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1' }],
    });
    expect(model.siblings('H1')).toEqual(['H2']);
    expect(model.clutch(model.parents('H1').clutchKey).childIds).toEqual(['H1', 'H2']);
  });

  it('keeps half-siblings in separate clutches — same sire, different dams', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A, DAM_B,
        hatchling('H1', { name: 'Runa x Confusion - 1', pairingId: 'P1' }),
        hatchling('H2', { name: 'Nova x Confusion - 1', pairingId: 'P2' }),
      ],
      pairings: [
        { id: 'P1', maleId: 'M1', femaleId: 'F1' },
        { id: 'P2', maleId: 'M1', femaleId: 'F2' },
      ],
    });
    // Not siblings of each other...
    expect(model.siblings('H1')).toEqual([]);
    expect(model.siblings('H2')).toEqual([]);
    // ...but both are children of the shared sire, in two distinct clutches.
    expect(model.children('M1').sort()).toEqual(['H1', 'H2']);
    expect(model.clutchesOf('M1')).toHaveLength(2);
  });

  it('keeps two clutches from the same pair apart', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A,
        hatchling('H1', { name: 'Runa x Confusion - 1', pairingId: 'P1' }),
        hatchling('H2', { name: 'Runa x Confusion - 1', pairingId: 'P2' }),
      ],
      pairings: [
        { id: 'P1', maleId: 'M1', femaleId: 'F1', clutch: { date: '2025-06-01' } },
        { id: 'P2', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01' } },
      ],
    });
    expect(model.siblings('H1')).toEqual([]);
    expect(model.clutchesOf('F1')).toHaveLength(2);
  });

  it('separates half-siblings that share a dam but have different sires', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, SIRE_B, DAM_A,
        hatchling('H1', { name: 'Runa x Confusion - 1', sireId: 'M1', damId: 'F1' }),
        hatchling('H2', { name: 'Runa x Hydra - 1', sireId: 'M2', damId: 'F1' }),
      ],
    });
    expect(model.siblings('H1')).toEqual([]);
    expect(model.clutchesOf('F1')).toHaveLength(2);
    expect(model.children('F1').sort()).toEqual(['H1', 'H2']);
  });

  it('orders a sibship by hatchling index, not by name', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A,
        hatchling('Hc', { name: 'Zulu', pairingId: 'P1', hatchlingIndex: 1 }),
        hatchling('Ha', { name: 'Alpha', pairingId: 'P1', hatchlingIndex: 2 }),
      ],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1' }],
    });
    expect(model.clutch('pair:P1').childIds).toEqual(['Hc', 'Ha']);
  });
});

describe('buildPedigree — eggs', () => {
  it('draws only the eggs a clutch has not already hatched', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A,
        hatchling('H1', { name: 'Runa x Confusion - 1', pairingId: 'P1' }),
        hatchling('H2', { name: 'Runa x Confusion - 2', pairingId: 'P1' }),
      ],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01', fertileEggs: 5 } }],
    });
    const clutch = model.clutch('pair:P1');
    expect(clutch.childIds).toHaveLength(2);
    expect(clutch.eggIds).toHaveLength(3);      // 5 laid, 2 out
    expect(clutch.memberIds).toHaveLength(5);   // never 7
  });

  it('draws no eggs once the whole clutch has hatched', () => {
    const model = buildPedigree({
      animals: [
        SIRE_A, DAM_A,
        hatchling('H1', { name: 'Runa x Confusion - 1', pairingId: 'P1' }),
        hatchling('H2', { name: 'Runa x Confusion - 2', pairingId: 'P1' }),
      ],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01', fertileEggs: 2 } }],
    });
    expect(model.clutch('pair:P1').eggIds).toEqual([]);
  });

  it('discounts slugs when only a total was recorded', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01', eggsTotal: 8, slugs: 3 } }],
    });
    expect(model.clutch('pair:P1').eggIds).toHaveLength(5);
  });

  it('shows an unhatched clutch that no animal points at yet', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01', fertileEggs: 4 } }],
    });
    expect(model.clutchesOf('F1')).toHaveLength(1);
    expect(model.clutch('pair:P1').eggIds).toHaveLength(4);
  });
});

describe('buildPedigree — merging server data', () => {
  it('never lets an empty server response blank the local pedigree', () => {
    const local = [SIRE_A, DAM_A, hatchling('H1', { name: 'Runa x Confusion - 1', sireId: 'M1', damId: 'F1' })];
    const withoutServer = buildPedigree({ animals: local });
    const withEmptyServer = buildPedigree({
      animals: local,
      server: { snakes: [{ id: 'H1', name: 'Runa x Confusion - 1', sex: 'unknown' }], relationships: [] },
    });
    expect(withEmptyServer.parents('H1')).toEqual(withoutServer.parents('H1'));
    expect(withEmptyServer.children('M1')).toEqual(['H1']);
  });

  it('lets the server fill a parent the browser does not know', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A, hatchling('H1', { name: 'Imported' })],
      server: {
        snakes: [],
        relationships: [{ childId: 'H1', parentId: 'M1', role: 'sire' }],
      },
    });
    expect(model.parents('H1').sireId).toBe('M1');
  });

  it('does not let the server overwrite a parent the keeper recorded', () => {
    const model = buildPedigree({
      animals: [SIRE_A, SIRE_B, DAM_A, hatchling('H1', { name: 'H1', sireId: 'M1' })],
      server: {
        snakes: [],
        relationships: [{ childId: 'H1', parentId: 'M2', role: 'sire' }],
      },
    });
    expect(model.parents('H1').sireId).toBe('M1');
  });
});

describe('clutchLabel', () => {
  it('prefers the written clutch id', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A, hatchling('H1', { name: 'H1', sireId: 'M1', damId: 'F1', clutchId: 'Runa x Confusion 2026' })],
    });
    expect(clutchLabel(model.clutch(model.parents('H1').clutchKey), model)).toBe('Runa x Confusion 2026');
  });

  it('falls back to dam x sire and the year', () => {
    const model = buildPedigree({
      animals: [SIRE_A, DAM_A],
      pairings: [{ id: 'P1', maleId: 'M1', femaleId: 'F1', clutch: { date: '2026-06-01', fertileEggs: 1 } }],
    });
    expect(clutchLabel(model.clutch('pair:P1'), model)).toBe('Runa x Confusion 2026');
  });
});

/**
 * These came from `inferParents.test.js`, which covered the old page-level inference. That code
 * is gone, but the rules it locked down are not: the tree once read the first half of a
 * "Dam x Sire" name as the sire, swapping the parents of every name-inferred animal and
 * reversing the clutch id rebuilt from them.
 */
describe('buildPedigree - names as keepers actually write them', () => {
  const dam = { id: 'F1', name: 'Runa', sex: 'F', groups: ['Breeders'] };
  const sire = { id: 'M1', name: 'Confusion Lesser Pastel het Clown', sex: 'M', groups: ['Breeders'] };

  it('reads the dam from the first half and the sire from the second', () => {
    const child = { id: 'C1', name: 'Runa × Confusion Lesser Pastel het Clown - 4', sex: 'F' };
    const model = buildPedigree({ animals: [dam, sire, child] });
    expect(model.parents('C1')).toMatchObject({ damId: 'F1', sireId: 'M1' });
  });

  it('reads a name with the year written in front of it', () => {
    const child = { id: 'C1', name: '26 Runa x Confusion Lesser Pastel het Clown - 4', sex: 'F' };
    const model = buildPedigree({ animals: [dam, sire, child] });
    expect(model.parents('C1')).toMatchObject({ damId: 'F1', sireId: 'M1' });
  });

  it('reads a year run straight into the name with no space', () => {
    const child = { id: 'C1', name: '26Runa x Confusion Lesser Pastel het Clown - 4', sex: 'F' };
    const model = buildPedigree({ animals: [dam, sire, child] });
    expect(model.parents('C1')).toMatchObject({ damId: 'F1', sireId: 'M1' });
  });

  it('rebuilds the clutch label in the order the name was written', () => {
    const child = { id: 'C1', name: '26 Runa x Confusion Lesser Pastel het Clown - 4', sex: 'F' };
    const model = buildPedigree({ animals: [dam, sire, child] });
    const clutch = model.clutch(model.parents('C1').clutchKey);
    expect(clutchLabel(clutch, model)).toBe('Runa x Confusion Lesser Pastel het Clown 2026');
  });

  it('keeps recorded parent ids in preference to anything read from the name', () => {
    // The name names Hydra; the record says Confusion. The record wins.
    const other = { id: 'M9', name: 'Hydra', sex: 'M', groups: ['Breeders'] };
    const child = { id: 'C1', name: 'Runa × Hydra - 4', sex: 'F', damId: 'F1', sireId: 'M1' };
    const model = buildPedigree({ animals: [dam, sire, other, child] });
    expect(model.parents('C1')).toMatchObject({ damId: 'F1', sireId: 'M1' });
  });
});
