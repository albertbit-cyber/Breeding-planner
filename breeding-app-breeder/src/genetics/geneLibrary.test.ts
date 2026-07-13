import { describe, expect, it } from 'vitest';
import { getGeneDisplayGroup, inferMorphType } from './geneLibrary';

describe('geneLibrary classification', () => {
  it('classifies Sugar as incomplete dominant/co-dom', () => {
    expect(getGeneDisplayGroup('Sugar')).toBe('Incomplete Dominant');
    expect(inferMorphType('Sugar')).toBe('co-dom');
  });
});
