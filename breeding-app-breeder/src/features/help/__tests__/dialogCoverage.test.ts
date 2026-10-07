import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Every window the breeder web app opens must be recognisable as one (so help can scope
// to it and a tour can point at it) and must carry its own ?, so it can be explored
// with Help Mode too. A full-screen layer is either a window or a click-away backdrop
// marked data-backdrop.

const SRC = join(__dirname, '..', '..', '..');
// The Android UI is out of scope for the help system; help's own UI is not an app window.
const SKIP = ['features/mobile', 'features/help'];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return walk(path);
  return /\.(jsx|tsx)$/.test(name) ? [path] : [];
});

const files = walk(SRC)
  .map(path => ({ rel: relative(SRC, path).replace(/\\/g, '/'), lines: readFileSync(path, 'utf8').split(/\r?\n/) }))
  .filter(file => !SKIP.some(prefix => file.rel.startsWith(prefix)));

const LOOKAHEAD_DIALOG = 14;
const LOOKAHEAD_HELP = 60;

describe('every app window is a dialog with its own ?', () => {
  const overlays: Array<{ where: string; ok: boolean }> = [];
  const dialogs: Array<{ id: string; where: string; hasHelp: boolean }> = [];

  for (const file of files) {
    file.lines.forEach((line, index) => {
      if (line.includes('fixed inset-0')) {
        const window = file.lines.slice(index, index + LOOKAHEAD_DIALOG).join('\n');
        // A layer whose panel sits further down (after an injected <style>, say) names it.
        const layer = line.match(/data-dialog-layer="([a-z0-9-]+)"/);
        const named = !!layer && file.lines.some(other => other.includes(`data-dialog="${layer[1]}"`));
        overlays.push({ where: `${file.rel}:${index + 1}`, ok: line.includes('data-backdrop') || named || window.includes('data-dialog=') });
      }
      const match = line.match(/data-dialog="([a-z0-9-]+)"/);
      if (match) {
        const after = file.lines.slice(index, index + LOOKAHEAD_HELP).join('\n');
        dialogs.push({ id: match[1], where: `${file.rel}:${index + 1}`, hasHelp: after.includes('<DialogHelpButton') });
      }
    });
  }

  it('finds the app windows (a broken scan cannot pass with zero)', () => {
    expect(overlays.length).toBeGreaterThan(30);
    expect(dialogs.length).toBeGreaterThan(35);
  });

  it('marks every full-screen layer as a dialog or a backdrop', () => {
    expect(overlays.filter(item => !item.ok).map(item => item.where)).toEqual([]);
  });

  it('gives every dialog its own ?', () => {
    expect(dialogs.filter(item => !item.hasHelp).map(item => `${item.id} at ${item.where}`)).toEqual([]);
  });

  it('gives every dialog a distinct id', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const item of dialogs) {
      if (seen.has(item.id)) clashes.push(`${item.id}: ${seen.get(item.id)} and ${item.where}`);
      seen.set(item.id, item.where);
    }
    expect(clashes).toEqual([]);
  });

  it('puts role="dialog" (or alertdialog) next to every data-dialog', () => {
    const missing: string[] = [];
    for (const file of files) {
      file.lines.forEach((line, index) => {
        if (!/data-dialog="/.test(line)) return;
        const near = file.lines.slice(Math.max(0, index - 4), index + 4).join('\n');
        if (!/role(=|: )["{']?(dialog|alertdialog|\{appDialog)/.test(near) && !near.includes("'alertdialog' : 'dialog'")) missing.push(`${file.rel}:${index + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
