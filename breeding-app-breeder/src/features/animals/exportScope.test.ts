import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANIMAL_EXPORT_SCOPE,
  collectAnimalScopeOptions,
  hasExplicitAnimalPicks,
  isAnimalScopeNarrowed,
  normalizeAnimalExportScope,
  selectAnimalsForExport,
  selectScopeCandidates,
} from './exportScope';

const COLLECTION = [
  { id: 'A1', name: 'Ada', groups: ['2026 Hatchlings'], tags: ['for sale'] },
  { id: 'A2', name: 'Bo', groups: ['2026 Hatchlings'], tags: [] },
  { id: 'A3', name: 'Cy', groups: ['2026 Hatchlings'], tags: ['hold back'] },
  { id: 'B1', name: 'Dot', groups: ['Breeders'], tags: ['for sale'] },
  { id: 'C1', name: 'Eli', groups: [], tags: [] },
];

const scope = (patch = {}) => ({ ...DEFAULT_ANIMAL_EXPORT_SCOPE, ...patch });
const ids = (animals: Array<{ id: string }>) => animals.map(animal => animal.id);

describe('normalising a scope', () => {
  it('fills in every field from nothing at all', () => {
    expect(normalizeAnimalExportScope(undefined)).toEqual({
      mode: 'all',
      groups: [],
      tags: [],
      excludedIds: [],
    });
  });

  it('falls back to all animals for a mode it does not know', () => {
    expect(normalizeAnimalExportScope({ mode: 'pick' }).mode).toBe('all');
  });

  it('drops blank entries rather than matching a group named empty string', () => {
    expect(normalizeAnimalExportScope({ groups: ['  Breeders ', '', '   '] }).groups).toEqual(['Breeders']);
  });
});

describe('the pickers offer what the animals actually carry', () => {
  it('lists groups and tags once each, sorted', () => {
    expect(collectAnimalScopeOptions(COLLECTION)).toEqual({
      groups: ['2026 Hatchlings', 'Breeders'],
      tags: ['for sale', 'hold back'],
    });
  });

  it('survives a collection with holes in it', () => {
    expect(collectAnimalScopeOptions([null, undefined, { id: 'X' }] as never)).toEqual({
      groups: [],
      tags: [],
    });
  });
});

describe('step one: the filter', () => {
  it('takes the whole collection when no filter is set', () => {
    expect(ids(selectScopeCandidates(COLLECTION, scope()))).toEqual(['A1', 'A2', 'A3', 'B1', 'C1']);
  });

  it('narrows to a chosen group', () => {
    expect(ids(selectScopeCandidates(COLLECTION, scope({ mode: 'groups', groups: ['2026 Hatchlings'] }))))
      .toEqual(['A1', 'A2', 'A3']);
  });

  it('treats an empty picker as nothing chosen yet, not as everything', () => {
    expect(selectScopeCandidates(COLLECTION, scope({ mode: 'groups' }))).toEqual([]);
    expect(selectScopeCandidates(COLLECTION, scope({ mode: 'tags' }))).toEqual([]);
  });
});

describe('step two: dropping individual animals', () => {
  it('exports a group minus the animals held back', () => {
    const selection = selectAnimalsForExport(
      COLLECTION,
      scope({ mode: 'groups', groups: ['2026 Hatchlings'], excludedIds: ['A3'] }),
    );
    expect(ids(selection)).toEqual(['A1', 'A2']);
  });

  it('composes with the tag filter too', () => {
    const selection = selectAnimalsForExport(
      COLLECTION,
      scope({ mode: 'tags', tags: ['for sale'], excludedIds: ['B1'] }),
    );
    expect(ids(selection)).toEqual(['A1']);
  });

  it('picks a handful straight out of the whole collection', () => {
    const selection = selectAnimalsForExport(COLLECTION, scope({ excludedIds: ['A2', 'A3', 'C1'] }));
    expect(ids(selection)).toEqual(['A1', 'B1']);
  });

  it('lets an animal joining the group later come along by default', () => {
    const withNewcomer = [...COLLECTION, { id: 'A4', name: 'Fen', groups: ['2026 Hatchlings'], tags: [] }];
    const selection = selectAnimalsForExport(
      withNewcomer,
      scope({ mode: 'groups', groups: ['2026 Hatchlings'], excludedIds: ['A3'] }),
    );
    expect(ids(selection)).toContain('A4');
  });
});

describe('recognising a deliberate hand-pick', () => {
  it('is false while the keeper has only used the filter', () => {
    expect(hasExplicitAnimalPicks(COLLECTION, scope({ mode: 'groups', groups: ['2026 Hatchlings'] }))).toBe(false);
  });

  it('is true once an animal the filter matched has been dropped', () => {
    expect(hasExplicitAnimalPicks(COLLECTION, scope({ mode: 'groups', groups: ['2026 Hatchlings'], excludedIds: ['A3'] })))
      .toBe(true);
  });

  it('ignores exclusions left over from a filter that no longer applies', () => {
    expect(hasExplicitAnimalPicks(COLLECTION, scope({ mode: 'groups', groups: ['Breeders'], excludedIds: ['A3'] })))
      .toBe(false);
  });
});

describe('knowing the export is narrowed', () => {
  it('is false for the untouched default', () => {
    expect(isAnimalScopeNarrowed(COLLECTION, scope())).toBe(false);
  });

  it('is true for a filter, and for a hand-pick out of everything', () => {
    expect(isAnimalScopeNarrowed(COLLECTION, scope({ mode: 'groups', groups: ['Breeders'] }))).toBe(true);
    expect(isAnimalScopeNarrowed(COLLECTION, scope({ excludedIds: ['A1'] }))).toBe(true);
  });
});
