import { describe, expect, it } from 'vitest';
import { superLabelFor } from './GeneAutocomplete.jsx';
import { getGeneByName } from '../genetics/geneDatabase';

const gene = (name) => {
  const record = getGeneByName(name);
  if (!record) throw new Error(`gene "${name}" is missing from the database`);
  return record;
};

describe('super form labels', () => {
  it('uses the plain form when the super has no trade name', () => {
    expect(superLabelFor(gene('Pastel'))).toBe('Super Pastel');
    expect(superLabelFor(gene('Enchi'))).toBe('Super Enchi');
  });

  it('appends the trade name, keeping the genetic name in front', () => {
    expect(superLabelFor(gene('Spotnose'))).toBe('Super Spotnose (Powerball)');
    expect(superLabelFor(gene('Woma'))).toBe('Super Woma (Pearl)');
    expect(superLabelFor(gene('Yellow Belly'))).toBe('Super Yellow Belly (Ivory)');
  });

  it('keeps the four Blue-Eyed Leucistic parents apart', () => {
    // The nickname is shared, so only the leading gene name says which allele it is.
    expect(superLabelFor(gene('Mojave'))).toBe('Super Mojave (Blue-Eyed Leucistic)');
    expect(superLabelFor(gene('Lesser'))).toBe('Super Lesser (Blue-Eyed Leucistic)');
    expect(superLabelFor(gene('Butter'))).toBe('Super Butter (Blue-Eyed Leucistic)');
    expect(superLabelFor(gene('Phantom'))).toBe('Super Phantom (Blue-Eyed Leucistic)');
  });

  it('offers a super for Banana', () => {
    expect(superLabelFor(gene('Banana'))).toBe('Super Banana');
  });

  it('never offers a super whose homozygous form is lethal', () => {
    // No keeper can hold these animals, so the row must not be selectable. The rule reads
    // the health flag rather than hasSuperForm, so a data correction to that boolean
    // cannot quietly put the row back.
    for (const name of ['Spider', 'Champagne', 'Hidden Gene Woma']) {
      const record = gene(name);
      expect(record.healthFlags).toContain('lethal_super');
      expect(superLabelFor(record)).toBeNull();
      expect(superLabelFor({ ...record, hasSuperForm: true, superGeneName: `Super ${name}` })).toBeNull();
    }
  });

  it('offers nothing for a gene with no super form', () => {
    expect(superLabelFor(gene('Vanilla'))).toBeNull();
    expect(superLabelFor(gene('Clown'))).toBeNull();
  });
});
