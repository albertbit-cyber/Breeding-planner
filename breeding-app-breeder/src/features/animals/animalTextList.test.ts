import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_YEAR_LABEL,
  buildAnimalTextList,
  formatAnimalLine,
  formatPrice,
  formatSexCode,
  resolveBirthYear,
} from './animalTextList';

describe('sex as the hobby writes it', () => {
  it('uses the 1.0 / 0.1 notation', () => {
    expect(formatSexCode('M')).toBe('1.0');
    expect(formatSexCode('female')).toBe('0.1');
  });

  it('marks an unsexed animal rather than guessing', () => {
    expect(formatSexCode('')).toBe('0.0.1');
    expect(formatSexCode(null)).toBe('0.0.1');
  });
});

describe('birth year', () => {
  it('prefers the explicit year field', () => {
    expect(resolveBirthYear({ year: 2026, birthDate: '2027-01-04' })).toBe(2026);
  });

  it('falls back to the birth date', () => {
    expect(resolveBirthYear({ birthDate: '2027-06-11' })).toBe(2027);
  });

  it('reports nothing when neither is readable', () => {
    expect(resolveBirthYear({})).toBeNull();
    expect(resolveBirthYear({ birthDate: 'spring' })).toBeNull();
  });
});

describe('price', () => {
  it('writes the symbol for the currencies keepers price in', () => {
    expect(formatPrice({ price: '450', currency: 'EUR' })).toBe('450 €');
    expect(formatPrice({ price: 600, currency: 'USD' })).toBe('600 $');
  });

  it('defaults to euros, which is what the animal editor stores', () => {
    expect(formatPrice({ price: '450' })).toBe('450 €');
  });

  it('spells out a currency it has no symbol for', () => {
    expect(formatPrice({ price: '450', currency: 'CZK' })).toBe('450 CZK');
  });

  it('leaves a price that already carries its currency alone', () => {
    // Appending a second symbol here would render "450 EUR €".
    expect(formatPrice({ price: '450 EUR' })).toBe('450 EUR');
    expect(formatPrice({ price: 'ask' })).toBe('ask');
  });

  it('is empty when no price is recorded', () => {
    expect(formatPrice({})).toBe('');
    expect(formatPrice({ price: '   ' })).toBe('');
    expect(formatPrice({ price: null })).toBe('');
  });
});

describe('a single line', () => {
  it('reads sex, genetics, price', () => {
    expect(formatAnimalLine({ sex: 'M', genetics: 'Pastel het Clown', price: '450' }))
      .toBe('1.0  Pastel het Clown — 450 €');
  });

  it('drops the price segment when there is no price, keeping the animal', () => {
    expect(formatAnimalLine({ sex: 'F', genetics: 'Banana Pied' })).toBe('0.1  Banana Pied');
  });

  it('stands in for genetics that were never logged', () => {
    expect(formatAnimalLine({ sex: 'F' })).toBe('0.1  —');
  });
});

describe('the whole list', () => {
  const animals = [
    { sex: 'F', genetics: 'Banana Pied', price: '600', year: 2026 },
    { sex: 'M', genetics: 'Super Pastel', price: '300', year: 2027 },
    { sex: 'M', genetics: 'Pastel het Clown', price: '450', year: 2026 },
  ];

  it('sections by year, newest first, males before females', () => {
    expect(buildAnimalTextList(animals)).toBe(
      [
        '2027',
        '1.0  Super Pastel — 300 €',
        '',
        '2026',
        '1.0  Pastel het Clown — 450 €',
        '0.1  Banana Pied — 600 €',
      ].join('\n')
    );
  });

  it('sorts by genetics within a sex so the section scans', () => {
    const text = buildAnimalTextList([
      { sex: 'M', genetics: 'Pastel', year: 2026 },
      { sex: 'M', genetics: 'Albino', year: 2026 },
    ]);
    expect(text).toBe(['2026', '1.0  Albino', '1.0  Pastel'].join('\n'));
  });

  it('keeps animals with no birth year, in their own section, last', () => {
    const text = buildAnimalTextList([
      { sex: 'M', genetics: 'Unknown hatch' },
      { sex: 'F', genetics: 'Banana', year: 2026 },
    ]);
    expect(text).toBe(
      ['2026', '0.1  Banana', '', UNKNOWN_YEAR_LABEL, '1.0  Unknown hatch'].join('\n')
    );
  });

  it('is empty for an empty selection rather than emitting a stray heading', () => {
    expect(buildAnimalTextList([])).toBe('');
    expect(buildAnimalTextList(null as never)).toBe('');
  });
});

describe('the unknown-year heading', () => {
  it('can be translated by the caller', () => {
    const text = buildAnimalTextList(
      [{ sex: 'M', genetics: 'Albino' }],
      { unknownYearLabel: 'Año no registrado' }
    );
    expect(text).toBe(['Año no registrado', '1.0  Albino'].join('\n'));
  });
});
