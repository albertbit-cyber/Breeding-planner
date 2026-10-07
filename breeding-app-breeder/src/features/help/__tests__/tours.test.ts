import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TOURS, getTour } from '../tours/registry';
import { OWN_TARGETS } from '../tours/ownTargets';
import { isHelpId } from '../registry';
import type { TourContext, TourData } from '../tours/tourTypes';
import { makeEnTranslator } from './enTranslator';

const tr = makeEnTranslator();
const SRC = join(__dirname, '..', '..', '..');
const SKIP = ['features/mobile', 'features/help/__tests__'];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return walk(path);
  return /\.(jsx|tsx|js|ts)$/.test(name) && !/\.(test|spec)\./.test(name) ? [path] : [];
});
const sources = walk(SRC)
  .map(path => ({ rel: relative(SRC, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }))
  .filter(file => !SKIP.some(prefix => file.rel.startsWith(prefix)));

const sourceTourIds = new Set<string>();
const sourceHelpIds = new Set<string>();
for (const file of sources) {
  for (const m of file.text.matchAll(/\btour\(\s*['"]([a-z0-9-]+)['"]\s*\)|data-tour=["']([a-z0-9-]+)["']|\btourId:\s*['"]([a-z0-9-]+)['"]/g)) sourceTourIds.add(m[1] || m[2] || m[3]);
  for (const m of file.text.matchAll(/\bhelp\(\s*['"]([a-z0-9-]+)['"]\s*\)|data-help=["']([a-z0-9-]+)["']|\bhelpId:\s*['"]([a-z0-9-]+)['"]/g)) sourceHelpIds.add(m[1] || m[2] || m[3]);
}

// A target is real when it is an own tour target or a help id that a control carries.
const isRealTarget = (target: string) =>
  target === 'dialog' || OWN_TARGETS.includes(target) || (isHelpId(target) && sourceHelpIds.has(target));

const REQUIRED_TOURS = ['essentials', 'tour-help'];
const ALLOWED_OFFERS = ['add-example-animal'];
// Explained, never asked for.
const DESTRUCTIVE = /\b(connect|sign(?:ed)? out|delete|remove|reset|restore|import|sync|publish|order|submit|cancel order|change plan|pay|clear)\b/i;

const text = (key: string) => String(tr.t(key) ?? '');

describe('tours', () => {
  it('has the essentials tour and every required tour', () => {
    for (const id of REQUIRED_TOURS) expect(getTour(id), id).toBeTruthy();
  });

  it('uses unique tour ids and unique step ids within a tour', () => {
    expect(new Set(TOURS.map(tour => tour.id)).size).toBe(TOURS.length);
    for (const tour of TOURS) {
      expect(new Set(tour.steps.map(step => step.id)).size, tour.id).toBe(tour.steps.length);
    }
  });

  it('gives every tour at least two steps and English for every key', () => {
    for (const tour of TOURS) {
      expect(tour.steps.length, tour.id).toBeGreaterThanOrEqual(2);
      for (const key of [tour.title, tour.description]) expect(tr.exists(key), key).toBe(true);
      for (const step of tour.steps) {
        for (const key of [step.part, step.title, step.text]) expect(tr.exists(key), key).toBe(true);
        if (step.missing) expect(tr.exists(step.missing), step.missing).toBe(true);
        if (step.offer) for (const key of [step.offer.label, step.offer.note]) expect(tr.exists(key), key).toBe(true);
      }
    }
  });

  it('runs the essentials parts 1..N in order', () => {
    const essentials = getTour('essentials')!;
    const parts = essentials.steps.map(step => Number(step.part.match(/parts\.(\d+)$/)?.[1]));
    expect(parts[0]).toBe(1);
    for (let i = 1; i < parts.length; i++) expect(parts[i] - parts[i - 1]).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < parts.length; i++) expect(parts[i] - parts[i - 1]).toBeLessThanOrEqual(1);
    const lastText = text(essentials.steps[essentials.steps.length - 1].text);
    expect(essentials.steps[essentials.steps.length - 1].target).toBe('help-button');
    expect(lastText).toMatch(/manual/i);
    expect(lastText).toMatch(/tour/i);
  });

  it('gives every do step a done() and no info step one', () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        if (step.kind === 'do') expect(typeof step.done, `${tour.id}/${step.id}`).toBe('function');
        else expect(step.done, `${tour.id}/${step.id}`).toBeUndefined();
      }
    }
  });

  it('offers exactly the allowed example, labelled as one', () => {
    const offers = TOURS.flatMap(tour => tour.steps.filter(step => step.offer).map(step => step.offer!));
    for (const offer of offers) {
      expect(ALLOWED_OFFERS).toContain(offer.id);
      expect(text(offer.label)).toMatch(/example/i);
      expect(text(offer.note)).toMatch(/delete/i);
    }
  });

  it('never asks the keeper to do anything destructive or outward', () => {
    for (const tour of TOURS) {
      for (const step of tour.steps.filter(item => item.kind === 'do')) {
        expect(text(step.title), `${tour.id}/${step.id}`).not.toMatch(DESTRUCTIVE);
      }
    }
  });

  it('never promises that the tour creates or deletes anything by itself', () => {
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        expect(text(step.text), `${tour.id}/${step.id}`).not.toMatch(/(?:tour|guide) (?:will )?(?:create|add|delete|remove)s?\b/i);
      }
    }
  });

  it('points only at real targets', () => {
    const bad: string[] = [];
    for (const tour of TOURS) {
      for (const step of tour.steps) {
        if (step.target && !isRealTarget(step.target)) bad.push(`${tour.id}/${step.id} -> ${step.target}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('rejects an invented target (the check is not an allow-anything)', () => {
    expect(isRealTarget('no-such-control-anywhere')).toBe(false);
    expect(isRealTarget('help-button')).toBe(true);
  });

  it('lists every data-tour in the source in OWN_TARGETS, and nothing stale', () => {
    expect([...sourceTourIds].filter(id => !OWN_TARGETS.includes(id))).toEqual([]);
    expect(OWN_TARGETS.filter(id => !sourceTourIds.has(id))).toEqual([]);
    expect(new Set(OWN_TARGETS).size).toBe(OWN_TARGETS.length);
  });
});

// Predicates are judged on fake contexts: false before the real change, true after.
const data = (patch: Partial<TourData> = {}): TourData => ({ realAnimals: 0, demo: true, feeds: 0, pairings: 0, exampleAnimal: false, ...patch });
export const fakeContext = (patch: Partial<TourContext> = {}): TourContext => ({
  data: data(),
  route: ['dashboard'],
  modal: null,
  view: {},
  base: { realAnimals: 0, feeds: 0, pairings: 0 },
  has: () => true,
  ...patch,
});

describe('tour predicates', () => {
  it('the Using help tour finishes when the manual opens', () => {
    const step = getTour('tour-help')!.steps.find(item => item.id === 'manual')!;
    expect(step.done!(fakeContext({ view: { manualOpen: false } }))).toBe(false);
    expect(step.done!(fakeContext({ view: { manualOpen: true } }))).toBe(true);
  });
});

describe('essentials predicates', () => {
  const step = (id: string) => getTour('essentials')!.steps.find(item => item.id === id)!;
  const cases: Array<[string, Partial<TourContext>, Partial<TourContext>]> = [
    ['open-species', { view: { speciesOpen: false } }, { view: { speciesOpen: true } }],
    ['add', { modal: null }, { modal: 'add-animal' }],
    ['add-real', { data: data({ realAnimals: 0 }), modal: 'add-animal' }, { data: data({ realAnimals: 1 }), modal: null }],
    ['open-record', { modal: null }, { modal: 'edit-animal' }],
    ['feed', { data: data({ feeds: 4 }), base: { feeds: 4 } }, { data: data({ feeds: 5 }), base: { feeds: 4 } }],
    ['close-record', { modal: 'edit-animal' }, { modal: null }],
    ['open-breeding', { route: ['animals', 'all'] }, { route: ['pairings', 'dashboard'] }],
    ['new-pairing', { modal: null }, { modal: 'create-pairing' }],
    ['close-pairing', { modal: 'create-pairing' }, { modal: null }],
  ];
  for (const [id, before, after] of cases) {
    it(`${id}: false before the real change, true after`, () => {
      expect(step(id).done!(fakeContext(before))).toBe(false);
      expect(step(id).done!(fakeContext(after))).toBe(true);
    });
  }

  it('counts only animals added during the step, not ones that already existed', () => {
    const add = step('add-real');
    expect(add.done!(fakeContext({ data: data({ realAnimals: 3 }), base: { realAnimals: 3 }, modal: 'add-animal' }))).toBe(false);
    expect(add.done!(fakeContext({ data: data({ realAnimals: 4 }), base: { realAnimals: 3 } }))).toBe(true);
  });

  it('accepts the example animal, added through the offer, as the first animal', () => {
    const add = step('add-real');
    expect(add.done!(fakeContext({ data: data({ exampleAnimal: true, realAnimals: 1 }), base: { realAnimals: 1 }, modal: null }))).toBe(true);
  });

  it('accepts the breeders-only notice as the pairing window opening', () => {
    expect(step('new-pairing').done!(fakeContext({ modal: 'breeders-guard' }))).toBe(true);
  });
});

describe('area tour predicates', () => {
  const step = (tour: string, id: string) => getTour(tour)!.steps.find(item => item.id === id)!;
  it('Animals: switching to Males, Females or Groups counts, All does not', () => {
    const view = step('tour-animals', 'view');
    expect(view.done!(fakeContext({ route: ['animals', 'all'] }))).toBe(false);
    expect(view.done!(fakeContext({ route: ['animals', 'females'] }))).toBe(true);
  });
  it('Breeding: opening the Incubator counts', () => {
    const incubator = step('tour-breeding', 'incubator');
    expect(incubator.done!(fakeContext({ route: ['pairings', 'dashboard'] }))).toBe(false);
    expect(incubator.done!(fakeContext({ route: ['pairings', 'incubator'] }))).toBe(true);
  });
  it('Settings: the Appearance controls being on screen counts', () => {
    const appearance = step('tour-settings', 'appearance');
    expect(appearance.done!(fakeContext({ has: () => false }))).toBe(false);
    expect(appearance.done!(fakeContext({ has: target => target === 'settings-appearance-preset' }))).toBe(true);
  });
});
