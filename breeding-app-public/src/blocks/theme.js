/**
 * Named colour themes for content blocks.
 *
 * Blocks reference a theme by name (`'gold'`, `'purple'`, …) rather than
 * carrying raw hex values. That is the whole reason the admin editor can offer a
 * swatch picker instead of a colour input, and why edited pages cannot drift off
 * the palette. The values below are lifted verbatim from the hand-written
 * HomePage so the converted page renders identically.
 */
export const BLOCK_THEMES = {
  teal:       { bg: '#d0e8e5', border: '#a8ccc8', accent: '#5e9a96', onAccent: '#fff',    title: '#1c3a38', desc: '#2a5450' },
  green:      { bg: '#d8eadc', border: '#aed0b4', accent: '#6a9e7a', onAccent: '#fff',    title: '#1c3824', desc: '#2a5238' },
  clay:       { bg: '#f0ddd6', border: '#d4b4a4', accent: '#c09080', onAccent: '#fff',    title: '#3c1c10', desc: '#5a3020' },
  gold:       { bg: '#f5edcc', border: '#e0d090', accent: '#c8a840', onAccent: '#1c1c1a', title: '#3c2c08', desc: '#5a4010' },
  terracotta: { bg: '#ecddd4', border: '#d0b4a0', accent: '#b07868', onAccent: '#fff',    title: '#2c1008', desc: '#4a2818' },
  purple:     { bg: '#e8dff8', border: '#c8b4ec', accent: '#9b65d6', onAccent: '#fff',    title: '#2c0c60', desc: '#4a2480' },
  coral:      { bg: '#fbd5d5', border: '#e8a8a8', accent: '#d86060', onAccent: '#fff',    title: '#4c1010', desc: '#6a2020' },
};

export const DEFAULT_THEME = 'gold';

export const themeOf = (name) => BLOCK_THEMES[name] || BLOCK_THEMES[DEFAULT_THEME];

/** Ordered list for the admin swatch picker. */
export const THEME_NAMES = Object.keys(BLOCK_THEMES);

/**
 * Single accent swatches, used where a block needs one colour rather than a
 * whole surface — the coloured strip along the top of a pricing card, say.
 */
export const ACCENTS = {
  teal: '#5e9a96',
  green: '#6a9e7a',
  clay: '#c09080',
  gold: '#c8a840',
  terracotta: '#b07868',
  purple: '#9b65d6',
  coral: '#d86060',
  neutral: '#a09888',
  slate: '#7a7265',
};

export const accentOf = (name) => ACCENTS[name] || ACCENTS.neutral;

export const ACCENT_NAMES = Object.keys(ACCENTS);

/**
 * Pill themes map onto the genetics-tag CSS variables rather than fixed hexes,
 * so pills keep following the app's tokens if those are ever retuned.
 */
export const PILL_THEMES = {
  gold:   { background: 'var(--gold-lt)',   color: 'var(--gold-dk)' },
  coral:  { background: 'var(--coral-lt)',  color: 'var(--coral-dk)' },
  purple: { background: 'var(--purple-lt)', color: 'var(--purple-dk)' },
};

export const pillThemeOf = (name) => PILL_THEMES[name] || PILL_THEMES.gold;

export const PILL_THEME_NAMES = Object.keys(PILL_THEMES);
