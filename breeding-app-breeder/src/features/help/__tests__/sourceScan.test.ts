import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isHelpId, TOPIC_IDS } from '../registry';

// Every help id a control carries must be a real topic. .jsx is not type-checked here,
// so this scan is what catches a typo in help('…') or data-help="…" there.

const SRC = join(__dirname, '..', '..', '..');
const SKIP = ['features/mobile', 'features/help/__tests__'];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return walk(path);
  return /\.(jsx|tsx|js|ts)$/.test(name) && !/\.(test|spec)\./.test(name) ? [path] : [];
});

const files = walk(SRC)
  .map(path => ({ rel: relative(SRC, path).replace(/\\/g, '/'), text: readFileSync(path, 'utf8') }))
  .filter(file => !SKIP.some(prefix => file.rel.startsWith(prefix)));

const PATTERNS = [
  /\bhelp\(\s*['"]([a-z0-9-]+)['"]\s*\)/g,
  /data-help=["']([a-z0-9-]+)["']/g,
  /data-help=\{\s*['"]([a-z0-9-]+)['"]\s*\}/g,
  /\bhelpId:\s*['"]([a-z0-9-]+)['"]/g,
];

const found: Array<{ id: string; where: string }> = [];
for (const file of files) {
  for (const pattern of PATTERNS) {
    for (const match of file.text.matchAll(pattern)) {
      const line = file.text.slice(0, match.index).split('\n').length;
      found.push({ id: match[1], where: `${file.rel}:${line}` });
    }
  }
}

// Raised as coverage grows, so a broken pattern cannot pass by matching nothing.
const FLOOR = 800;

describe('help ids in the source', () => {
  it('finds enough of them for the scan to mean something', () => {
    expect(found.length).toBeGreaterThan(FLOOR);
  });

  it('resolves every id to a topic', () => {
    const unknown = found.filter(item => !isHelpId(item.id)).map(item => `${item.id} at ${item.where}`);
    expect(unknown).toEqual([]);
  });

  it('uses only literal ids, so this scan can see them', () => {
    const dynamic: string[] = [];
    for (const file of files) {
      if (file.rel.startsWith('features/help/')) continue;
      for (const match of file.text.matchAll(/data-help=\{(?!\s*['"])([^}]*)\}/g)) {
        // The one allowed indirection: a list whose entries carry `helpId: '…'` literals.
        if (/^\s*(helpId|item\.helpId|entry\.helpId|tab\.helpId|option\.helpId)\s*$/.test(match[1])) continue;
        const line = file.text.slice(0, match.index).split('\n').length;
        dynamic.push(`${file.rel}:${line} data-help={${match[1]}}`);
      }
    }
    expect(dynamic).toEqual([]);
  });

  it('leaves few topics unused (concept topics excepted)', () => {
    const used = new Set(found.map(item => item.id));
    const unused = TOPIC_IDS.filter(id => !used.has(id));
    // Concept and help-system topics have no single control of their own.
    expect(unused.length).toBeLessThan(TOPIC_IDS.length * 0.25);
  });
});
