import { describe, expect, it } from 'vitest';
import { parseAnimalText } from './quickAddParser';

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
