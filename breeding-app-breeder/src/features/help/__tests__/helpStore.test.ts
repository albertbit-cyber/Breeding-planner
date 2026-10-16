// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fresh module per test: the store reads localStorage once, when it is created.
const freshStore = async () => {
  vi.resetModules();
  return import('../helpStore');
};

beforeEach(() => {
  localStorage.clear();
});

describe('helpStore', () => {
  it('starts with Help Mode off and nothing open', async () => {
    const { helpStore } = await freshStore();
    const state = helpStore.getState();
    expect(state).toMatchObject({ mode: false, menuOpen: false, manualOpen: false, popover: null, tour: null });
    expect(state.flags).toEqual({ invited: false, completed: [], paused: null, helpHintDismissed: false });
  });

  it('turning Help Mode on closes the menu and popover and dismisses the hint', async () => {
    const { helpStore } = await freshStore();
    helpStore.openMenu();
    helpStore.explain({ id: 'help-mode', name: 'Help Mode', element: document.body });
    helpStore.setMode(true);
    expect(helpStore.getState()).toMatchObject({ mode: true, menuOpen: false, popover: null });
    expect(helpStore.getState().flags.helpHintDismissed).toBe(true);
  });

  it('turning Help Mode on pauses a running tour and keeps its place', async () => {
    const { helpStore } = await freshStore();
    helpStore.set({ tour: { id: 'essentials', index: 3, base: {} } });
    helpStore.setMode(true);
    expect(helpStore.getState().tour).toBeNull();
    expect(helpStore.getState().flags.paused).toEqual({ tour: 'essentials', index: 3 });
  });

  it('opening the manual dismisses the hint and closes the menu', async () => {
    const { helpStore } = await freshStore();
    helpStore.openMenu();
    helpStore.openManual('help-mode');
    expect(helpStore.getState()).toMatchObject({ manualOpen: true, manualTopic: 'help-mode', menuOpen: false });
    expect(helpStore.getState().flags.helpHintDismissed).toBe(true);
  });

  it('remembers the flags in serpentora.help.v1, and nothing else', async () => {
    const { helpStore, HELP_STORAGE_KEY } = await freshStore();
    helpStore.setMode(true);
    helpStore.setFlags({ invited: true, completed: ['essentials'] });
    expect(Object.keys(localStorage)).toEqual([HELP_STORAGE_KEY]);
    const stored = JSON.parse(localStorage.getItem(HELP_STORAGE_KEY) || '{}');
    expect(stored).toEqual({ invited: true, completed: ['essentials'], paused: null, helpHintDismissed: true });
    expect(stored).not.toHaveProperty('mode');
  });

  it('reads remembered flags back, and survives junk', async () => {
    localStorage.setItem('serpentora.help.v1', JSON.stringify({ invited: true, completed: ['a', 7], paused: { tour: 'b', index: -2 } }));
    let { helpStore } = await freshStore();
    expect(helpStore.getState().flags).toEqual({ invited: true, completed: ['a'], paused: { tour: 'b', index: 0 }, helpHintDismissed: false });
    localStorage.setItem('serpentora.help.v1', '{not json');
    ({ helpStore } = await freshStore());
    expect(helpStore.getState().flags.invited).toBe(false);
  });

  it('notifies subscribers and stops after unsubscribe', async () => {
    const { helpStore } = await freshStore();
    const listener = vi.fn();
    const off = helpStore.subscribe(listener);
    helpStore.openMenu();
    off();
    helpStore.closeMenu();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('helpStore focus hand-back', () => {
  it('remembers what had focus when the menu opened, through to the manual', async () => {
    const { helpStore } = await freshStore();
    document.body.innerHTML = '<button id="q">?</button><button id="other">x</button>';
    document.getElementById('q')!.focus();
    helpStore.openMenu();
    document.getElementById('other')!.focus();
    helpStore.openManual(null);
    helpStore.closeManual();
    expect(helpStore.takeOpener()?.id).toBe('q');
    expect(helpStore.takeOpener()).toBeNull();
  });
});
