import { useSyncExternalStore } from 'react';
import type { HelpExplanation } from './helpGuard';

// Help's own state: a tiny external store read with React's useSyncExternalStore, so
// the guard (installed before React mounts) and the components see the same values.
//
// Two lifetimes:
// - Presentation (mode, menu, manual, popover, the running tour): this window only,
//   never persisted, never synced.
// - Remembered flags (invited, completed, paused, helpHintDismissed): localStorage
//   'serpentora.help.v1', device-local like the quarantine notice. Not part of the
//   planner sync state, so nothing about help ever reaches the server.

export const HELP_STORAGE_KEY = 'serpentora.help.v1';

export interface PausedTour {
  tour: string;
  index: number;
}

export interface HelpFlags {
  invited: boolean;
  completed: string[];
  paused: PausedTour | null;
  helpHintDismissed: boolean;
}

export interface HelpPopover {
  // Topic id, or null for a control with no topic (shown by its accessible name).
  id: string | null;
  name: string;
  anchor: Element | null;
  disabled?: boolean;
  // Bumped on every explain, so pressing the same control again re-opens and re-focuses.
  seq: number;
}

export interface ActiveTour {
  id: string;
  index: number;
  base: Record<string, number>;
}

export interface HelpState {
  mode: boolean;
  menuOpen: boolean;
  manualOpen: boolean;
  manualTopic: string | null;
  popover: HelpPopover | null;
  tour: ActiveTour | null;
  flags: HelpFlags;
}

const DEFAULT_FLAGS: HelpFlags = { invited: false, completed: [], paused: null, helpHintDismissed: false };

const storage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

export const loadFlags = (): HelpFlags => {
  try {
    const raw = storage()?.getItem(HELP_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FLAGS };
    const parsed = JSON.parse(raw) || {};
    const paused = parsed.paused && typeof parsed.paused.tour === 'string' && Number.isInteger(parsed.paused.index)
      ? { tour: parsed.paused.tour, index: Math.max(0, parsed.paused.index) }
      : null;
    return {
      invited: parsed.invited === true,
      completed: Array.isArray(parsed.completed) ? parsed.completed.filter((id: unknown) => typeof id === 'string') : [],
      paused,
      helpHintDismissed: parsed.helpHintDismissed === true,
    };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
};

const saveFlags = (flags: HelpFlags) => {
  try {
    storage()?.setItem(HELP_STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // Storage full or blocked: help still works for this visit, it just will not remember.
  }
};

type Listener = () => void;

const createHelpStore = () => {
  let state: HelpState = {
    mode: false,
    menuOpen: false,
    manualOpen: false,
    manualTopic: null,
    popover: null,
    tour: null,
    flags: loadFlags(),
  };
  const listeners = new Set<Listener>();
  let seq = 0;

  const set = (patch: Partial<HelpState>) => {
    const flagsChanged = patch.flags && patch.flags !== state.flags;
    state = { ...state, ...patch };
    if (flagsChanged) saveFlags(state.flags);
    listeners.forEach(listener => listener());
  };

  const setFlags = (patch: Partial<HelpFlags>) => set({ flags: { ...state.flags, ...patch } });

  return {
    getState: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set,
    setFlags,

    // Help Mode and tours never run together: turning Help Mode on pauses the tour,
    // keeping its place so the Help menu can offer Resume.
    setMode: (on: boolean) => {
      if (on === state.mode) return;
      const patch: Partial<HelpState> = { mode: on, popover: null, menuOpen: false };
      if (on && state.tour) {
        patch.tour = null;
        patch.flags = { ...state.flags, paused: { tour: state.tour.id, index: state.tour.index } };
      }
      if (on) patch.flags = { ...(patch.flags || state.flags), helpHintDismissed: true };
      set(patch);
    },

    openMenu: () => set({ menuOpen: true, popover: null }),
    closeMenu: () => set({ menuOpen: false }),

    openManual: (topicId: string | null = null) => set({
      manualOpen: true,
      manualTopic: topicId,
      menuOpen: false,
      popover: null,
      flags: state.flags.helpHintDismissed ? state.flags : { ...state.flags, helpHintDismissed: true },
    }),
    closeManual: () => set({ manualOpen: false }),

    explain: ({ id, name, element, disabled }: HelpExplanation) => {
      seq += 1;
      set({ popover: { id, name, anchor: element, disabled: !!disabled, seq } });
    },
    showTopic: (id: string) => {
      seq += 1;
      set({ popover: state.popover ? { ...state.popover, id, seq } : { id, name: '', anchor: null, seq } });
    },
    closePopover: () => { if (state.popover) set({ popover: null }); },

    dismissHint: () => setFlags({ helpHintDismissed: true }),
  };
};

export const helpStore = createHelpStore();

export type HelpStore = typeof helpStore;

export const isHelpModeOn = () => helpStore.getState().mode;

export function useHelpState<T>(selector: (state: HelpState) => T): T {
  return useSyncExternalStore(
    helpStore.subscribe,
    () => selector(helpStore.getState()),
    () => selector(helpStore.getState()),
  );
}
