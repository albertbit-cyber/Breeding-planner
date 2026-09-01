/**
 * Framework-free skin application.
 *
 * Every frontend in the suite needs the same three things: read the persisted
 * appearance blob, decide which [data-skin] block applies, and stamp the
 * result onto <html>. That logic lived in four forked copies of
 * AppearanceContext.jsx (two of which had drifted 96 lines apart). It lives
 * here now.
 *
 * No colors. The palette is skins.css; this only chooses which block wins.
 */

export const APPEARANCE_STORAGE_KEY = 'breedingPlannerAppearance.v1';

/** Skins that themeMode picks when the user has never chosen one explicitly. */
export const SYSTEM_LIGHT_SKIN = 'default';
export const SYSTEM_DARK_SKIN = 'deep-canopy';

// Audit R9: 'high-contrast' is a skin (high-contrast-forest), not a mode.
export const THEME_MODES = ['system', 'light', 'dark'];
export const HIGH_CONTRAST_SKIN = 'high-contrast-forest';

/**
 * The skin picker IS the light/dark choice — each block declares its own
 * `color-scheme`. themeMode therefore only decides the palette for users who
 * never picked a skin, which keeps "Match system" meaningful for the majority
 * who never open the appearance panel. An explicit skin always wins.
 */
export function resolveSkinId(preset, themeMode, systemTheme) {
  if (preset && preset !== 'default') return preset;
  const effective = themeMode === 'system' ? systemTheme : themeMode;
  return effective === 'dark' ? SYSTEM_DARK_SKIN : SYSTEM_LIGHT_SKIN;
}

export function systemPrefersDark() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function systemPrefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function readStoredAppearance() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Stamps skin + layout attributes onto <html>.
 *
 * An unrecognised `preset` is deliberately NOT special-cased: it simply matches
 * no [data-skin] block, so the :root defaults — which are the `default` skin —
 * apply. Bad state degrades to the shipped look instead of to nothing.
 */
export function applySkinToRoot(state = {}, options = {}) {
  if (typeof document === 'undefined') return null;

  const systemTheme = (options.systemTheme ?? (systemPrefersDark() ? 'dark' : 'light'));
  const systemMotion = options.systemMotion ?? systemPrefersReducedMotion();

  // Legacy state may still carry the retired mode; route it to the AAA skin.
  const legacyHighContrast = state.themeMode === 'high-contrast';
  const themeMode = THEME_MODES.includes(state.themeMode) ? state.themeMode : 'system';
  const effectiveThemeMode = themeMode === 'system' ? systemTheme : themeMode;
  const skinId = legacyHighContrast ? HIGH_CONTRAST_SKIN : resolveSkinId(state.preset, themeMode, systemTheme);

  const root = document.documentElement;
  root.dataset.skin = skinId;
  // `flat` has no [data-material] block: it lands on the :root fallback.
  root.dataset.material = state.material || 'flat';
  root.dataset.themeMode = effectiveThemeMode;
  root.dataset.appearanceDensity = state.layoutDensity || 'comfortable';
  root.dataset.appearanceRadius = state.borderStyle || 'soft';
  root.dataset.backgroundMode = state.backgroundMode || 'solid';

  const reduced = state?.motion?.reducedMotion === true || systemMotion;
  root.dataset.motionPreference = reduced ? 'reduced' : 'full';

  return { skinId, material: state.material || 'flat', effectiveThemeMode, reduced };
}
