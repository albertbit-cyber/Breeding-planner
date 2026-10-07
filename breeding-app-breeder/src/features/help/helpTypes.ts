// The help system's data model. Every explanation in Help Mode, the manual and the
// tours comes from one registry of topics; this file is its shape.
//
// Topics hold i18n keys, never text. A topic's English lives in locales/en/help.json
// under topic.<id>.{title,short,more,tips,words}; other languages fall back to English
// until they are translated. A topic about a control reuses the key the control itself
// renders as its title, so the two can never drift apart.

// The manual's sections, in the order a new keeper meets them. The order here is the
// order of the contents page.
export const CATEGORIES = [
  'getting-started',
  'dashboard',
  'animals',
  'animal-record',
  'adding',
  'breeding',
  'advisor',
  'family-tree',
  'calendar',
  'feed-prep',
  'spaces',
  'quarantine',
  'lab',
  'selling',
  'account',
  'settings',
  'data',
] as const;

export type Category = (typeof CATEGORIES)[number];

// What a topic file writes, one entry per id.
export interface TopicDef {
  category: Category;
  // An existing i18n key the control renders as its label ("common:nav.pairings").
  // Omitted: the title is help:topic.<id>.title.
  title?: string;
  // Ids of topics a curious keeper would open next. Validated by the registry test.
  see?: readonly string[];
  // Minor sub-controls (single form fields) fold into a <details> in the contents.
  minor?: boolean;
}

// One entry in the merged registry.
export interface HelpTopic {
  id: string;
  category: Category;
  titleKey: string;
  shortKey: string;
  moreKey: string;
  tipsKey: string;
  wordsKey: string;
  related: readonly string[];
  minor: boolean;
}

// The registry's text, in the current language.
export interface ResolvedTopic {
  id: string;
  category: Category;
  categoryLabel: string;
  title: string;
  short: string;
  more: string;
  tips: string[];
  words: string[];
  related: readonly string[];
  minor: boolean;
}

// The slice of an i18next instance the help system needs. The app passes its own;
// tests build one from the English files.
export interface Translator {
  t: (key: string, options?: Record<string, unknown>) => unknown;
  exists: (key: string) => boolean;
}

// The builder topic files use: topic('animals', { see: ['animal-search'] }).
export const topic = (category: Category, options: Omit<TopicDef, 'category'> = {}): TopicDef => ({
  category,
  ...options,
});
