import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAll } from '../registry';
import enHelp from '../../../locales/en/help.json';
import { makeEnTranslator } from './enTranslator';

// Help never claims what Serpentora does not do. The claims checked here come from
// breeding-app-public/PRODUCT.md ("Claims that are NOT supported") and from what the
// code does with the keeper's data (App.jsx: saveStoredJson as you go, and the debounced
// cloud save while signed in). Tour text joins this check when tours exist.

const topics = resolveAll(makeEnTranslator());
const topicText = (topic: (typeof topics)[number]) =>
  [topic.title, topic.short, topic.more, ...topic.tips, ...topic.words].join('\n');
// Every string under a node, one per line, so a sentence never borrows its neighbour's words.
const strings = (node: unknown): string[] =>
  typeof node === 'string' ? [node]
    : node && typeof node === 'object' ? Object.values(node as Record<string, unknown>).flatMap(strings)
      : [];
const allText = [
  topics.map(topicText).join('\n'),
  ...strings((enHelp as { ui?: unknown }).ui),
  // Tour titles, steps, missing texts and the example offer.
  ...strings((enHelp as { tour?: unknown }).tour),
].join('\n');
const sentences = allText.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
const byId = (id: string) => topics.find(topic => topic.id === id);

const VERIFY_PAGE = join(__dirname, '..', '..', '..', '..', '..', 'breeding-app-public', 'src', 'pages', 'VerifyCertificatePage.jsx');

const MUST_NOT: Array<[RegExp, string]> = [
  [/export(?:ing|s)? (?:\w+ )?(?:directly )?to morphmarket/i, 'MorphMarket is import only: a CSV in, never an export out'],
  [/\bios\b|iphone|ipad|app store/i, 'there is no iOS app'],
  [/\b7 plans\b|seven plans|most popular/i, 'plans are not "7" and none is "most popular"'],
  [/\btrial\b/i, 'there are no trials'],
  [/buyers? (?:can|will|may) (?:check|verify|see|find|browse)|verif(?:y|ied) online|online verification/i, 'certificate lookup is not presented as live for buyers'],
  [/marketplace is live|listing is live|live on the marketplace|sell on serpentora|launched/i, 'the marketplace is not presented as shipped'],
  [/ai sales copy|ai health|telegram/i, 'AI copy, AI health summaries and Telegram are not shipped'],
  [/encrypt/i, 'nothing claims encryption'],
  [/never leaves (?:your|this) (?:device|computer|browser)|only (?:stored )?on (?:this|your) device|stays on (?:this|your) device|private by default|end-to-end|zero[- ]knowledge/i, 'records are sent to the server while signed in'],
  [/real[- ]time|instant(?:ly)? sync|syncs? instantly/i, 'cloud saves follow shortly after a change, not in real time'],
  [/works (?:fully )?offline|offline mode/i, 'no offline mode is claimed'],
  [/[—–]/, 'no em or en dashes in help text (house style)'],
];

describe('help text is honest', () => {
  it('has text to check', () => {
    expect(topics.length).toBeGreaterThan(20);
  });

  for (const [pattern, why] of MUST_NOT) {
    it(`never says: ${why}`, () => {
      const hits = sentences.filter(sentence => pattern.test(sentence));
      expect(hits).toEqual([]);
    });
  }

  it('only mentions buying, paying or checkout to say it is not possible yet', () => {
    const money = /\b(?:buy|bought|purchas\w*|pay|paid|payment|checkout|charged?|billing|subscribe)\b/i;
    const negated = /\bnot\b|\bno\b|cannot|can't|isn't|aren't|\byet\b|never/i;
    const hits = sentences.filter(sentence => money.test(sentence) && !negated.test(sentence));
    expect(hits).toEqual([]);
  });

  it('says how saving really works', () => {
    const saving = byId('saving');
    expect(saving).toBeTruthy();
    expect(topicText(saving!)).toMatch(/saved in this browser as you go/);
    expect(topicText(saving!)).toMatch(/sent to your Serpentora account/);
  });

  it('says the MorphMarket import takes a CSV in', () => {
    const imports = topics.filter(topic => /morphmarket/i.test(topicText(topic)));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.some(topic => /csv|export file|exported/i.test(topicText(topic)))).toBe(true);
  });

  it('says predictions are chances, not promises', () => {
    const genetics = topics.filter(topic => topic.category === 'advisor' || topic.category === 'breeding');
    expect(genetics.length).toBeGreaterThan(0);
    expect(genetics.some(topic => /chance|probabilit|estimate|odds/i.test(topicText(topic)))).toBe(true);
  });

  it('mentions certificate lookup only if the public /verify page exists', () => {
    if (existsSync(VERIFY_PAGE)) return;
    expect(sentences.filter(sentence => /\/verify|look(?:ed)? up (?:a|the) certificate/i.test(sentence))).toEqual([]);
  });
});
