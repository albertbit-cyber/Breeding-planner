import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { LOOK_KEY } from './data.js';

/* The two skins the marketing site ships with — "Jungle Glass" dark and
 * "Hatchling" light. Both are real product settings in the app, so both have to
 * keep working; the site demonstrates them by wearing them.
 *
 * The choice is remembered per device under the design's own storage key, and
 * applied as `data-look` on the page wrapper rather than on <html>, because
 * AppearanceContext already owns custom properties on the document element for
 * the rest of the site. */

const LookContext = createContext(null);

function readStoredLook() {
  try {
    const saved = window.localStorage.getItem(LOOK_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    // Private mode, or a browser blocking site data. Fall back to the default.
    return null;
  }
}

export function useLookState(initial = 'dark') {
  const [look, setLook] = useState(initial);

  // Read on mount rather than during the initial render so the first paint is
  // identical for every visitor and cannot differ from a prerendered page.
  useEffect(() => {
    const saved = readStoredLook();
    if (saved) setLook(saved);
  }, []);

  const apply = useCallback((next) => {
    setLook(next);
    try {
      window.localStorage.setItem(LOOK_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth interrupting anyone.
    }
  }, []);

  const isLight = look === 'light';

  return {
    look,
    isLight,
    setLook: apply,
    setDark: useCallback(() => apply('dark'), [apply]),
    setLight: useCallback(() => apply('light'), [apply]),
    toggle: useCallback(() => apply(isLight ? 'dark' : 'light'), [apply, isLight]),
    lookName: isLight ? 'Hatchling' : 'Jungle Glass',
    lookLabel: isLight ? 'Dark ↺' : 'Light ↺',
  };
}

export const LookProvider = LookContext.Provider;

export function useLook() {
  const ctx = useContext(LookContext);
  if (!ctx) throw new Error('useLook must be used inside the v6 site');
  return ctx;
}

/** Button styling for the two theme pickers, which highlight the active skin. */
export function lookButtonStyles(isLight) {
  return {
    dark: {
      background: isLight ? 'transparent' : 'var(--accent-quiet)',
      borderColor: isLight ? 'var(--rule-strong)' : 'var(--accent-strong)',
      color: isLight ? 'var(--ink-2)' : 'var(--accent)',
    },
    light: {
      background: isLight ? 'var(--accent-quiet)' : 'transparent',
      borderColor: isLight ? 'var(--accent-strong)' : 'var(--rule-strong)',
      color: isLight ? 'var(--accent)' : 'var(--ink-2)',
    },
  };
}
