import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Help is translated into every app language. The locale check (scripts/check-app-locales.cjs)
// only proves each key exists; this also holds the shape a translation can break without a
// missing key: the number of tips, the {{placeholders}}, and empty strings.

const LOCALES = join(__dirname, '..', '..', '..', 'locales');
const read = (lang: string) =>
  JSON.parse(readFileSync(join(LOCALES, lang, 'help.json'), 'utf8').replace(/^\uFEFF/, ''));

const SETTINGS = join(__dirname, '..', '..', '..', '..', '..', 'breeding-app-shared', 'src', 'i18n', 'settings.json');
const settings: { supportedLangs: string[] } = JSON.parse(readFileSync(SETTINGS, 'utf8'));

const en = read('en');
const placeholders = (text: string) => (text.match(/\{\{[^}]+\}\}/g) || []).sort().join(' ');
const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;

type Problem = string;
const compare = (base: unknown, other: unknown, at: string, out: Problem[]) => {
  if (typeof base === 'string') {
    if (typeof other !== 'string') out.push(`${at}: not a string`);
    else if (!other.trim()) out.push(`${at}: empty`);
    else if (placeholders(base) !== placeholders(other)) out.push(`${at}: placeholders differ`);
    return;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(other)) out.push(`${at}: not a list`);
    else if (other.length !== base.length) out.push(`${at}: ${other.length} items, English has ${base.length}`);
    else base.forEach((item, i) => compare(item, other[i], `${at}[${i}]`, out));
    return;
  }
  const baseObj = base as Record<string, unknown>;
  const otherObj = (other || {}) as Record<string, unknown>;
  for (const key of Object.keys(baseObj)) {
    if (!(key in otherObj)) out.push(`${at}.${key}: missing`);
    else compare(baseObj[key], otherObj[key], `${at}.${key}`, out);
  }
  for (const key of Object.keys(otherObj)) {
    const plural = key.match(PLURAL);
    if (key in baseObj || (plural && `${plural[1]}_other` in baseObj)) continue;
    out.push(`${at}.${key}: not in English`);
  }
};

describe('help translations', () => {
  const languages = settings.supportedLangs.filter(lang => lang !== 'en');

  it.each(languages)('%s has every help text, in the same shape as English', (lang) => {
    const problems: Problem[] = [];
    compare(en, read(lang), lang, problems);
    expect(problems.slice(0, 20)).toEqual([]);
  });

  it.each(languages)('%s is translated, not English text copied over', (lang) => {
    const other = read(lang);
    const copied = Object.keys(en.topic).filter(id => other.topic[id]?.short === en.topic[id].short);
    expect(copied).toEqual([]);
  });
});
