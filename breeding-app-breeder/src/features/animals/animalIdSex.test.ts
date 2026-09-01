import { describe, expect, it } from 'vitest';

import { idStatesSex, retagIdForSex } from './animalIdSex';

/** The shipped default. A hatchling with no recorded genetics comes out as "26-U-242". */
const DEFAULT_TEMPLATE = '[YROB][GEN3][-][SEX]-[SEQ]';

describe('retagIdForSex on generated IDs', () => {
  it('moves the unknown marker to the sex the keeper picked, sequence untouched', () => {
    const opts = { template: DEFAULT_TEMPLATE };
    expect(retagIdForSex('26-U-242', 'M', opts)).toBe('26-M-242');
    expect(retagIdForSex('26-U-242', 'F', opts)).toBe('26-F-242');
  });

  it('sexes back to unknown when the keeper takes the call back', () => {
    expect(retagIdForSex('26-M-242', 'U', { template: DEFAULT_TEMPLATE })).toBe('26-U-242');
  });

  it('accepts the long forms of sex the pickers and imports use', () => {
    const opts = { template: DEFAULT_TEMPLATE };
    expect(retagIdForSex('26-U-242', 'Male', opts)).toBe('26-M-242');
    expect(retagIdForSex('26-U-242', 'female', opts)).toBe('26-F-242');
  });

  it('leaves a gene initial that happens to be M or F alone', () => {
    // A Fire hatchling: [GEN3] is glued to the year, so a naive scan would grab that F.
    expect(retagIdForSex('26F-U-242', 'M', { template: DEFAULT_TEMPLATE })).toBe('26F-M-242');
    expect(retagIdForSex('26MP-U-242', 'F', { template: DEFAULT_TEMPLATE })).toBe('26MP-F-242');
  });

  it('keeps a zero-padded sequence exactly as it was', () => {
    expect(retagIdForSex('26-U-0042', 'M', { template: DEFAULT_TEMPLATE })).toBe('26-M-0042');
  });

  it('finds the slot by position even when a second marker sits elsewhere', () => {
    // [TEXT] set to "M" would defeat a plain scan, but the template pins the real slot.
    const template = '[YROB][-][TEXT][-][SEX]-[SEQ]';
    expect(retagIdForSex('26-M-U-242', 'F', { template })).toBe('26-M-F-242');
  });

  it('respects an uppercase template', () => {
    expect(retagIdForSex('26-U-242', 'm', { template: DEFAULT_TEMPLATE })).toBe('26-M-242');
  });
});

describe('retagIdForSex on hand-typed IDs', () => {
  it('leaves an ID that does not state a sex completely alone', () => {
    expect(retagIdForSex('MOJAVE-01', 'M')).toBe('MOJAVE-01');
    expect(retagIdForSex('BP2026-117', 'F')).toBe('BP2026-117');
    expect(retagIdForSex('Firefly Clown 3', 'M')).toBe('Firefly Clown 3');
  });

  it('swaps a delimited single letter', () => {
    expect(retagIdForSex('ALB-U-7', 'M')).toBe('ALB-M-7');
    expect(retagIdForSex('alb_u_7', 'F')).toBe('alb_f_7');
    expect(retagIdForSex('U-7', 'M')).toBe('M-7');
    expect(retagIdForSex('7-U', 'F')).toBe('7-F');
  });

  it('swaps a spelled-out sex and keeps the keeper casing', () => {
    expect(retagIdForSex('Unknown-14', 'M')).toBe('Male-14');
    expect(retagIdForSex('UNKNOWN-14', 'F')).toBe('FEMALE-14');
    expect(retagIdForSex('unknown-14', 'M')).toBe('male-14');
    expect(retagIdForSex('Clown male 4', 'F')).toBe('Clown female 4');
  });

  it('does not read the male inside female', () => {
    expect(retagIdForSex('female-14', 'M')).toBe('male-14');
  });

  it('handles the unk abbreviation, dropping to a letter once sexed', () => {
    expect(retagIdForSex('UNK-14', 'M')).toBe('M-14');
    expect(retagIdForSex('unk-14', 'F')).toBe('f-14');
    expect(retagIdForSex('M-14', 'U')).toBe('U-14');
  });

  it('swaps a ratio and keeps its separator', () => {
    expect(retagIdForSex('26-0.0-242', 'M')).toBe('26-1.0-242');
    expect(retagIdForSex('26-0.0-242', 'F')).toBe('26-0.1-242');
    expect(retagIdForSex('26-1.0-242', 'U')).toBe('26-0.0-242');
    expect(retagIdForSex('26-1:0-242', 'F')).toBe('26-0:1-242');
  });

  it('does not mistake a bare number for a ratio', () => {
    expect(retagIdForSex('26-10-242', 'M')).toBe('26-10-242');
    expect(retagIdForSex('01-242', 'M')).toBe('01-242');
  });

  it('leaves an ambiguous ID alone rather than guessing which marker is the sex', () => {
    expect(retagIdForSex('M-U-7', 'F')).toBe('M-U-7');
  });

  it('leaves a letter glued to other characters alone', () => {
    expect(retagIdForSex('MOJ26-11', 'F')).toBe('MOJ26-11');
    expect(retagIdForSex('26F242', 'M')).toBe('26F242');
  });

  it('returns blank and whitespace IDs untouched', () => {
    expect(retagIdForSex('', 'M')).toBe('');
    expect(retagIdForSex('   ', 'M')).toBe('   ');
    expect(retagIdForSex(null, 'M')).toBe('');
  });
});

describe('idStatesSex', () => {
  it('is true only when there is a marker to move', () => {
    expect(idStatesSex('26-U-242', { template: DEFAULT_TEMPLATE })).toBe(true);
    expect(idStatesSex('Unknown-14')).toBe(true);
    expect(idStatesSex('26-0.0-242')).toBe(true);
    expect(idStatesSex('MOJAVE-01')).toBe(false);
    expect(idStatesSex('')).toBe(false);
  });
});
