import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_SEX,
  ensureSex,
  isFemaleSnake,
  isMaleSnake,
  normalizeSexValue,
  sexOrUnknown,
} from './animalSex';

describe('reading sex', () => {
  it('reads the forms keepers actually type', () => {
    expect(normalizeSexValue('male')).toBe('M');
    expect(normalizeSexValue('F')).toBe('F');
    expect(normalizeSexValue('1.0')).toBe('M');
    expect(normalizeSexValue('0.1')).toBe('F');
  });

  it('treats anything else as not sexed yet', () => {
    expect(normalizeSexValue('')).toBe(UNKNOWN_SEX);
    expect(normalizeSexValue(null)).toBe(UNKNOWN_SEX);
    expect(normalizeSexValue('unknown')).toBe(UNKNOWN_SEX);
    expect(normalizeSexValue('U')).toBe(UNKNOWN_SEX);
  });

  it('uses U, which is what the [SEX] token in a generated ID needs', () => {
    // The ID template takes the first letter of the sex. Anything other than U here would put
    // the wrong letter on every unsexed hatchling.
    expect(UNKNOWN_SEX).toBe('U');
    expect(UNKNOWN_SEX.charAt(0).toUpperCase()).toBe('U');
  });
});

describe('storing sex', () => {
  it('keeps unknown as unknown', () => {
    // The bug this replaced: choosing "Unknown" in the add form saved the animal as female,
    // because the save path coerced through a fallback.
    expect(sexOrUnknown('U')).toBe('U');
    expect(sexOrUnknown('')).toBe('U');
    expect(sexOrUnknown(undefined)).toBe('U');
  });

  it('still records a stated sex', () => {
    expect(sexOrUnknown('female')).toBe('F');
    expect(sexOrUnknown('M')).toBe('M');
  });
});

describe('coercing sex', () => {
  it('falls back only where a definite answer is required', () => {
    // Reserved for things that cannot represent unknown, such as picking a side of a cross.
    expect(ensureSex('U', 'F')).toBe('F');
    expect(ensureSex('', 'M')).toBe('M');
    expect(ensureSex('female', 'M')).toBe('F');
  });
});

describe('sex predicates', () => {
  it('counts an unsexed animal as neither male nor female', () => {
    const hatchling = { sex: 'U' };
    expect(isFemaleSnake(hatchling)).toBe(false);
    expect(isMaleSnake(hatchling)).toBe(false);
  });

  it('still sorts stated animals correctly', () => {
    expect(isFemaleSnake({ sex: 'F' })).toBe(true);
    expect(isMaleSnake({ sex: 'M' })).toBe(true);
    expect(isFemaleSnake({ sex: 'M' })).toBe(false);
  });
});
