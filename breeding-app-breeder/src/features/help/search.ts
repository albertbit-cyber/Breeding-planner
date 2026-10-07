import type { ResolvedTopic } from './helpTypes';

// The manual's search: local, ranked and forgiving. No network.
//
// - The query splits into lowercase words. Every word must match the START of some word
//   in the topic ("pair" finds "pairing"); a topic missing any word is out.
// - Hyphenated words are also indexed joined ("check-ins" matches "checkins").
// - Each query word scores the best field it hits: title 10, other names 8, short
//   description 4, section 3, detail 2, tips 2. Topics sort by total, then by title.

const WEIGHTS = { title: 10, words: 8, short: 4, category: 3, more: 2, tips: 2 } as const;
type Field = keyof typeof WEIGHTS;

const WORD = /[\p{L}\p{N}]+/gu;
const JOINED = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)+/gu;

export const queryWords = (query: string): string[] =>
  Array.from(new Set((query.toLowerCase().match(WORD) || [])));

const tokens = (text: string): string[] => {
  const lower = text.toLowerCase();
  const words = lower.match(WORD) || [];
  const joined = (lower.match(JOINED) || []).map(chunk => chunk.replace(/[-'’]/g, ''));
  return [...words, ...joined];
};

export interface IndexedTopic {
  topic: ResolvedTopic;
  fields: Record<Field, string[]>;
}

export const indexTopics = (topics: ResolvedTopic[]): IndexedTopic[] =>
  topics.map(topic => ({
    topic,
    fields: {
      title: tokens(topic.title),
      words: tokens(topic.words.join(' ')),
      short: tokens(topic.short),
      category: tokens(topic.categoryLabel),
      more: tokens(topic.more),
      tips: tokens(topic.tips.join(' ')),
    },
  }));

const FIELDS = Object.keys(WEIGHTS) as Field[];

export const searchTopics = (index: IndexedTopic[], query: string): ResolvedTopic[] => {
  const words = queryWords(query);
  if (!words.length) return [];
  const hits: Array<{ topic: ResolvedTopic; score: number }> = [];
  for (const entry of index) {
    let score = 0;
    let matchedAll = true;
    for (const word of words) {
      let best = 0;
      for (const field of FIELDS) {
        if (WEIGHTS[field] > best && entry.fields[field].some(token => token.startsWith(word))) best = WEIGHTS[field];
      }
      if (!best) { matchedAll = false; break; }
      score += best;
    }
    if (matchedAll) hits.push({ topic: entry.topic, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title))
    .map(hit => hit.topic);
};
