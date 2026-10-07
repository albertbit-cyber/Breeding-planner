// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => {
  vi.resetModules();
  const mod = await import('../helpStore');
  mod.helpStore.registerTours(id => ({ essentials: 4, short: 2 } as Record<string, number>)[id] ?? null);
  return mod;
};

beforeEach(() => localStorage.clear());

describe('tour store', () => {
  it('starting a tour turns Help Mode off and closes help windows', async () => {
    const { helpStore } = await fresh();
    helpStore.setMode(true);
    helpStore.openManual('help-mode');
    helpStore.startTour('essentials');
    expect(helpStore.getState()).toMatchObject({ mode: false, menuOpen: false, manualOpen: false, popover: null });
    expect(helpStore.getState().tour).toMatchObject({ id: 'essentials', index: 0 });
  });

  it('starting marks the keeper invited and clears a paused place', async () => {
    const { helpStore } = await fresh();
    helpStore.setFlags({ paused: { tour: 'short', index: 1 } });
    helpStore.startTour('essentials');
    expect(helpStore.getState().flags).toMatchObject({ invited: true, paused: null });
  });

  it('clamps the starting index', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('essentials', 99);
    expect(helpStore.getState().tour?.index).toBe(3);
    helpStore.startTour('essentials', -3);
    expect(helpStore.getState().tour?.index).toBe(0);
  });

  it('exit saves the place and resume continues from it', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('essentials');
    helpStore.nextStep();
    helpStore.nextStep();
    helpStore.exitTour();
    expect(helpStore.getState().tour).toBeNull();
    const paused = helpStore.getState().flags.paused!;
    expect(paused).toEqual({ tour: 'essentials', index: 2 });
    helpStore.startTour(paused.tour, paused.index);
    expect(helpStore.getState().tour?.index).toBe(2);
  });

  it('Back never goes below 0', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('short');
    helpStore.backStep();
    expect(helpStore.getState().tour?.index).toBe(0);
  });

  it('finishing marks completed once and clears paused', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('short');
    helpStore.nextStep();
    helpStore.nextStep();
    expect(helpStore.getState().tour).toBeNull();
    expect(helpStore.getState().flags.completed).toEqual(['short']);
    helpStore.startTour('short');
    helpStore.finishTour();
    expect(helpStore.getState().flags.completed).toEqual(['short']);
    expect(helpStore.getState().flags.paused).toBeNull();
  });

  it('skip moves on like Next', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('essentials');
    helpStore.skipStep();
    expect(helpStore.getState().tour?.index).toBe(1);
  });

  it('changing step clears the baseline for the engine to recapture', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('essentials');
    helpStore.setTourBase({ feeds: 3 });
    expect(helpStore.getState().tour?.base).toEqual({ feeds: 3 });
    helpStore.nextStep();
    expect(helpStore.getState().tour?.base).toEqual({});
  });

  it('ignores unknown tour ids', async () => {
    const { helpStore } = await fresh();
    const before = helpStore.getState();
    helpStore.startTour('nope');
    expect(helpStore.getState()).toBe(before);
  });

  it('remembers an answered invitation', async () => {
    const { helpStore, HELP_STORAGE_KEY } = await fresh();
    helpStore.dismissInvitation();
    expect(JSON.parse(localStorage.getItem(HELP_STORAGE_KEY)!).invited).toBe(true);
  });

  it('turning Help Mode on during a tour pauses it at its place', async () => {
    const { helpStore } = await fresh();
    helpStore.startTour('essentials', 2);
    helpStore.setMode(true);
    expect(helpStore.getState().tour).toBeNull();
    expect(helpStore.getState().flags.paused).toEqual({ tour: 'essentials', index: 2 });
  });
});
