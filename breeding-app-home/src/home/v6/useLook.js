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
  // Read during initialisation, not on mount. Reading afterwards meant a visitor
  // who had chosen Hatchling got a dark first paint that then transitioned to
  // light — a visible flash of the wrong skin on every page load. There is no
  // server render or prerender here, so nothing can disagree with this value.
  const [look, setLook] = useState(() => readStoredLook() || initial);

  const apply = useCallback((next) => {
    setLook(next);
    try {
      window.localStorage.setItem(LOOK_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth interrupting anyone.
    }
  }, []);

  // The skin paints `.v6`, but `.v6` is a div inside body — so without this the
  // document behind it stays white: overscroll rubber-banding flashes white on a
  // near-black page, native scrollbars and form controls render light, and the
  // mobile browser chrome is tinted to the wrong colour. Stamp the look onto
  // <html> so the ground, the colour-scheme and the theme-color all follow it.
  //
  // A data attribute rather than a custom property, because AppearanceContext
  // owns custom properties on the document element for the rest of the suite.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.v6Look;
    root.dataset.v6Look = look;

    const meta = document.querySelector('meta[name="theme-color"]');
    const previousTheme = meta?.getAttribute('content');
    meta?.setAttribute('content', look === 'light' ? '#fffaf0' : '#04100e');

    return () => {
      // Leaving the landing route hands the document back to the light chrome
      // the other pages are built for.
      if (previous === undefined) delete root.dataset.v6Look;
      else root.dataset.v6Look = previous;
      if (previousTheme != null) meta?.setAttribute('content', previousTheme);
    };
  }, [look]);

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
