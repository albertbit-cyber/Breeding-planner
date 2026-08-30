import { describe, expect, it } from 'vitest';
import { detectSpeciesFromText, parseAnimalText } from './quickAddParser';

const genetics = [
  'BEL',
  'Clown',
  'Genetic Stripe',
  'GHI',
  'Monsoon',
  'Sugar',
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

  it('treats triple het as grouped recessive het genes', () => {
    const parsed = parseAnimalText('triple het clown genetic stripe monsoon sugar', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining([
      'Het Clown',
      'Het Genetic Stripe',
      'Het Monsoon',
    ]));
    expect(parsed.morphs).toContain('Sugar');
    expect(parsed.morphs).not.toEqual(expect.arrayContaining(['Clown', 'Genetic Stripe', 'Monsoon']));
  });

  it('supports th shorthand for triple het', () => {
    const parsed = parseAnimalText('th clown genetic stripe monsoon', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining([
      'Het Clown',
      'Het Genetic Stripe',
      'Het Monsoon',
    ]));
  });

  it('applies percentage to every triple het recessive gene', () => {
    const parsed = parseAnimalText('66% triple het clown genetic stripe monsoon sugar', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining([
      '66% Het Clown',
      '66% Het Genetic Stripe',
      '66% Het Monsoon',
    ]));
    expect(parsed.morphs).toContain('Sugar');
    expect(parsed.morphs).not.toEqual(expect.arrayContaining(['Clown', 'Genetic Stripe', 'Monsoon']));
  });

  it('supports 50 percent triple het groups', () => {
    const parsed = parseAnimalText('50% triple het clown genetic stripe monsoon', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining([
      '50% Het Clown',
      '50% Het Genetic Stripe',
      '50% Het Monsoon',
    ]));
  });

  it('treats double het as grouped recessive het genes', () => {
    const parsed = parseAnimalText('double het clown monsoon sugar', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining(['Het Clown', 'Het Monsoon']));
    expect(parsed.morphs).toContain('Sugar');
    expect(parsed.morphs).not.toEqual(expect.arrayContaining(['Clown', 'Monsoon']));
  });

  it('supports dh shorthand for double het', () => {
    const parsed = parseAnimalText('dh clown monsoon', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining(['Het Clown', 'Het Monsoon']));
  });

  it('applies percentage to every double het recessive gene', () => {
    const parsed = parseAnimalText('66% double het clown monsoon sugar', genetics);

    expect(parsed.hets).toEqual(expect.arrayContaining(['66% Het Clown', '66% Het Monsoon']));
    expect(parsed.morphs).toContain('Sugar');
    expect(parsed.morphs).not.toEqual(expect.arrayContaining(['Clown', 'Monsoon']));
  });
});

describe('detectSpeciesFromText', () => {
  it('recognises a species named at the start', () => {
    const found = detectSpeciesFromText('crested gecko 0.1 harlequin cappuccino 52g');
    expect(found?.speciesId).toBe('crested-gecko');
    expect(found?.matched).toBe('crested gecko');
    // The phrase is removed so it cannot then be read as genetics.
    expect(found?.rest).toBe('0.1 harlequin cappuccino 52g');
  });

  it('recognises a species after a leading ID, which is how pastes usually look', () => {
    const found = detectSpeciesFromText('MS-24-033 0.1 corn snake amel motley 310g');
    expect(found?.speciesId).toBe('corn-snake');
    expect(found?.rest).toBe('MS-24-033 0.1 amel motley 310g');
  });

  it('accepts plural, singular and scientific names', () => {
    expect(detectSpeciesFromText('ball pythons 1.0 pastel')?.speciesId).toBe('ball-python');
    expect(detectSpeciesFromText('ball python 1.0 pastel')?.speciesId).toBe('ball-python');
    expect(detectSpeciesFromText('Python regius 1.0 pastel')?.speciesId).toBe('ball-python');
  });

  it('accepts the nicknames keepers actually type', () => {
    expect(detectSpeciesFromText('crestie 0.1 harlequin')?.speciesId).toBe('crested-gecko');
    expect(detectSpeciesFromText('retic 1.0 tiger')?.speciesId).toBe('reticulated-python');
    expect(detectSpeciesFromText('beardie 0.1 hypo')?.speciesId).toBe('bearded-dragon');
  });

  it('prefers the longest match, so a compound name beats its suffix', () => {
    expect(detectSpeciesFromText('short-tailed python 1.0')?.speciesId).toBe('short-tailed-python');
    expect(detectSpeciesFromText('green tree python 1.0')?.speciesId).toBe('green-tree-python');
  });

  it('does not mistake a gene for a species', () => {
    // "Leopard" is a ball python gene and "Banana" a morph name. Neither may be read as a
    // species, or a keeper's genetics would be silently reinterpreted as a species change.
    expect(detectSpeciesFromText('0.1 leopard pastel het clown')).toBeNull();
    expect(detectSpeciesFromText('Banana Blast 1.0 620g')).toBeNull();
    expect(detectSpeciesFromText('0.1 tiger pinstripe')).toBeNull();
  });

  it('returns null when no species is named, which is the ordinary case', () => {
    expect(detectSpeciesFromText('MS-24-033 0.1 pastel clown het pied 620g')).toBeNull();
    expect(detectSpeciesFromText('')).toBeNull();
    expect(detectSpeciesFromText('   ')).toBeNull();
  });

  it('does not match a species name embedded inside a word', () => {
    expect(detectSpeciesFromText('0.1 crestieish thing')).toBeNull();
  });
});
