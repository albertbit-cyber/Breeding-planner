import { CATEGORIES, type Category, type HelpTopic, type ResolvedTopic, type TopicDef, type Translator } from './helpTypes';
import { gettingStarted } from './topics/gettingStarted';

// Every topic file, in category order. Files never import each other; the registry
// merges them once. Kept as a list so the registry test can see a duplicate id that
// the spread below would silently overwrite.
export const TOPIC_SOURCES = [
  gettingStarted,
] as const;

const DEFS = {
  ...gettingStarted,
} satisfies Record<string, TopicDef>;

// A typo in help('…') fails tsc in .ts files; .jsx is not type-checked here, so the
// source-scan test is what fails on an unknown id there.
export type HelpId = keyof typeof DEFS;

const buildTopic = (id: string, def: TopicDef): HelpTopic => ({
  id,
  category: def.category,
  titleKey: def.title || `help:topic.${id}.title`,
  shortKey: `help:topic.${id}.short`,
  moreKey: `help:topic.${id}.more`,
  tipsKey: `help:topic.${id}.tips`,
  wordsKey: `help:topic.${id}.words`,
  related: def.see || [],
  minor: def.minor === true,
});

export const TOPICS: Readonly<Record<string, HelpTopic>> = Object.freeze(
  Object.fromEntries(Object.entries(DEFS).map(([id, def]) => [id, buildTopic(id, def as TopicDef)]))
);

export const TOPIC_IDS = Object.keys(TOPICS) as HelpId[];

export const isHelpId = (id: unknown): id is HelpId =>
  typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOPICS, id);

export const getTopic = (id: string | null | undefined): HelpTopic | null =>
  (id && isHelpId(id) ? TOPICS[id] : null);

// The manual's sections, in order, with empty categories dropped.
export const topicsByCategory = (): Array<{ category: Category; topics: HelpTopic[] }> =>
  CATEGORIES
    .map(category => ({ category, topics: TOPIC_IDS.map(id => TOPICS[id]).filter(item => item.category === category) }))
    .filter(group => group.topics.length > 0);

const text = (tr: Translator, key: string): string => {
  if (!tr.exists(key)) return '';
  const value = tr.t(key);
  return typeof value === 'string' ? value : '';
};

const list = (tr: Translator, key: string): string[] => {
  if (!tr.exists(key)) return [];
  const value = tr.t(key, { returnObjects: true });
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
};

export const categoryLabel = (tr: Translator, category: Category): string =>
  text(tr, `help:category.${category}`) || category;

export const resolveTopic = (topic: HelpTopic, tr: Translator): ResolvedTopic => ({
  id: topic.id,
  category: topic.category,
  categoryLabel: categoryLabel(tr, topic.category),
  title: text(tr, topic.titleKey),
  short: text(tr, topic.shortKey),
  more: text(tr, topic.moreKey),
  tips: list(tr, topic.tipsKey),
  words: text(tr, topic.wordsKey).split(/[,\s]+/).map(word => word.trim()).filter(Boolean),
  related: topic.related.filter(isHelpId),
  minor: topic.minor,
});

export const resolveAll = (tr: Translator): ResolvedTopic[] => TOPIC_IDS.map(id => resolveTopic(TOPICS[id], tr));
