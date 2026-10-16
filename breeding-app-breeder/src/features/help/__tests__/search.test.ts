import { describe, expect, it } from 'vitest';
import type { ResolvedTopic } from '../helpTypes';
import { indexTopics, queryWords, searchTopics } from '../search';
import { resolveAll } from '../registry';
import { makeEnTranslator } from './enTranslator';

const make = (id: string, patch: Partial<ResolvedTopic>): ResolvedTopic => ({
  id,
  category: 'getting-started',
  categoryLabel: 'Getting Started',
  title: id,
  short: '',
  more: '',
  tips: [],
  words: [],
  related: [],
  minor: false,
  ...patch,
});

const fixture = indexTopics([
  make('export', { title: 'Export', short: 'Saves a copy of everything to a file.', words: ['backup', 'download'] }),
  make('checks', { title: 'Log check', short: 'Records a quarantine check-in.', more: 'Each check-ins entry is dated.' }),
  make('pairing', { title: 'New pairing', short: 'Starts a pairing between a male and a female.' }),
  make('notes', { title: 'Notes', short: 'Free text.', tips: ['Use notes for pairing remarks.'] }),
]);

const ids = (query: string) => searchTopics(fixture, query).map(topic => topic.id);

describe('manual search', () => {
  it('matches the start of words', () => {
    expect(ids('pair')).toContain('pairing');
    expect(ids('airing')).toEqual([]);
  });

  it('ranks a title hit above a tip hit', () => {
    expect(ids('pairing')).toEqual(['pairing', 'notes']);
  });

  it('needs every word to match', () => {
    expect(ids('pairing male')).toEqual(['pairing']);
    expect(ids('pairing zebra')).toEqual([]);
  });

  it('finds a topic by a keyword synonym', () => {
    expect(ids('backup')).toEqual(['export']);
  });

  it('ignores case and hyphens', () => {
    expect(ids('EXPORT')).toEqual(['export']);
    expect(ids('checkins')).toEqual(['checks']);
    expect(ids('check-ins')).toEqual(['checks']);
  });

  it('returns nothing for nonsense or an empty query', () => {
    expect(ids('qwxzzy')).toEqual([]);
    expect(ids('')).toEqual([]);
    expect(ids('   ,, ')).toEqual([]);
  });

  it('splits a query into distinct lowercase words', () => {
    expect(queryWords('Het het, Clutch!')).toEqual(['het', 'clutch']);
  });

  it('finds real topics in the shipped English registry', () => {
    const real = indexTopics(resolveAll(makeEnTranslator()));
    const found = (query: string) => searchTopics(real, query).map(topic => topic.id);
    expect(found('help mode')[0]).toBe('help-mode');
    expect(found('tour')).toContain('guided-tours');
    expect(found('pedigree')).toContain('nav-family-tree');
    expect(found('autosave')).toContain('saving');
  });
});
