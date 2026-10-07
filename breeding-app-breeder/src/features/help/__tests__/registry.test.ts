import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../helpTypes';
import { TOPICS, TOPIC_IDS, TOPIC_SOURCES, getTopic, isHelpId, resolveAll, resolveTopic, topicsByCategory } from '../registry';
import { help, tour } from '../help';
import { makeEnTranslator } from './enTranslator';

const tr = makeEnTranslator();
const resolved = resolveAll(tr);

// The features that must always be documented. Hand-kept on purpose: removing a topic
// someone relies on should be a decision, not an accident.
const REQUIRED_TOPICS = [
  'serpentora',
  'main-nav',
  'nav-dashboard',
  'nav-animals',
  'nav-pairings',
  'nav-setup',
  'saving',
  'help-button',
  'help-mode',
  'help-manual',
  'manual-search',
  'guided-tours',
];

// Sections that must never be empty. Grows as the coverage pass fills the manual.
const REQUIRED_CATEGORIES = ['getting-started'];

describe('help registry', () => {
  it('has every required topic', () => {
    for (const id of REQUIRED_TOPICS) expect(isHelpId(id), id).toBe(true);
  });

  it('has no id defined in two topic files', () => {
    const seen = new Map<string, number>();
    TOPIC_SOURCES.forEach((source, index) => {
      for (const id of Object.keys(source)) {
        expect(seen.has(id), `${id} is in topic files ${seen.get(id)} and ${index}`).toBe(false);
        seen.set(id, index);
      }
    });
    expect(seen.size).toBe(TOPIC_IDS.length);
  });

  it('uses stable kebab-case ids', () => {
    for (const id of TOPIC_IDS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every topic a title and a real short description in English', () => {
    for (const item of resolved) {
      expect(item.title.trim(), `${item.id} title`).not.toBe('');
      expect(item.title, `${item.id} title is a raw key`).not.toMatch(/^[a-z]+:|topic\./);
      expect(item.short.length, `${item.id} short`).toBeGreaterThan(10);
    }
  });

  it('puts every topic in a known category', () => {
    for (const id of TOPIC_IDS) expect(CATEGORIES).toContain(TOPICS[id].category);
  });

  it('labels every category', () => {
    for (const category of CATEGORIES) {
      expect(tr.exists(`help:category.${category}`), category).toBe(true);
    }
  });

  it('links only to topics that exist, never to itself', () => {
    for (const id of TOPIC_IDS) {
      for (const related of TOPICS[id].related) {
        expect(isHelpId(related), `${id} -> ${related}`).toBe(true);
        expect(related).not.toBe(id);
      }
    }
  });

  it('fills every required manual section', () => {
    const sections = topicsByCategory().map(group => group.category);
    for (const category of REQUIRED_CATEGORIES) expect(sections).toContain(category);
  });

  it('orders the manual sections by the category list and drops empty ones', () => {
    const sections = topicsByCategory().map(group => group.category);
    const order = sections.map(category => CATEGORIES.indexOf(category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(topicsByCategory().every(group => group.topics.length > 0)).toBe(true);
  });

  it('has no English text for an id that is not a topic', () => {
    const helpJson = (tr.t('help:topic', { returnObjects: true }) || {}) as Record<string, unknown>;
    for (const id of Object.keys(helpJson)) expect(isHelpId(id), `help.json topic.${id}`).toBe(true);
  });

  it('borrows the control label for nav topics, so the title is the visible name', () => {
    expect(resolveTopic(TOPICS['nav-pairings'], tr).title).toBe(tr.t('common:nav.pairings'));
    expect(resolveTopic(TOPICS['nav-lab-tests'], tr).title).toBe('Lab tests');
  });

  it('resolves tips and keywords as lists', () => {
    const helpMode = resolveTopic(TOPICS['help-mode'], tr);
    expect(helpMode.tips.length).toBeGreaterThan(0);
    expect(helpMode.words).toContain('explore');
    expect(resolveTopic(TOPICS['help-hint'], tr).tips).toEqual([]);
  });

  it('looks topics up safely', () => {
    expect(getTopic('help-mode')?.id).toBe('help-mode');
    expect(getTopic('no-such-topic')).toBeNull();
    expect(getTopic(undefined)).toBeNull();
    expect(getTopic('toString')).toBeNull();
  });

  it('turns ids into the attributes controls carry', () => {
    expect(help('help-mode')).toEqual({ 'data-help': 'help-mode' });
    expect(tour('species-card')).toEqual({ 'data-tour': 'species-card' });
  });

  it('rejects an unknown id at type level', () => {
    // If help() ever accepted any string, this directive would be unused and tsc would fail.
    // @ts-expect-error 'nav-animal' is a typo for 'nav-animals'
    expect(help('nav-animal')).toEqual({ 'data-help': 'nav-animal' });
  });
});
