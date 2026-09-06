/**
 * skins.contrast.test.js
 * Parses skins.css and asserts the contrast contract for every skin.
 *
 * Runner-agnostic: exports `run()` which returns { pass, failures }.
 * Under vitest/jest the `describe` block at the bottom picks it up.
 *
 *   node  skins.contrast.test.js            → prints a table, exits 1 on failure
 *   vitest run skins.contrast.test.js       → one assertion per skin
 *
 * This is the guardrail. It is the only thing standing between users and an
 * unreadable custom preset, and it is what stops the audit's findings
 * regressing once they're fixed.
 */

const fs = require('fs');
const path = require('path');

const CSS_PATH = process.env.SKINS_CSS
  || path.join(__dirname, '..', 'styles', 'skins.css');

// ── colour maths ────────────────────────────────────────────────────────────
function parseHex(h) {
  const s = h.trim().replace(/^#/, '');
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
}
function relLum([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function rgbDist(a, b) {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

// ── parse skins.css ─────────────────────────────────────────────────────────
function parseSkins(css) {
  const skins = {};
  const re = /\[data-skin="([^"]+)"\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const vars = {};
    for (const line of m[2].split(';')) {
      const kv = line.match(/(--sk-[a-z0-9-]+)\s*:\s*([^;]+)/i);
      if (kv) vars[kv[1]] = kv[2].trim();
    }
    skins[m[1]] = vars;
  }
  return skins;
}

// ── the contract ────────────────────────────────────────────────────────────
// [foreground, background, minimum]. 'AAA' skins raise every 4.5 to 7.
const TEXT_PAIRS = [
  ['--sk-text',               '--sk-surface',       4.5],
  ['--sk-text-secondary',     '--sk-surface-2',     4.5],
  ['--sk-text-muted',         '--sk-surface',       4.5], // the 334-site role
  ['--sk-text-subtle',        '--sk-surface',       4.5],
  ['--sk-text-on-accent',     '--sk-primary',       4.5], // audit R2
  ['--sk-primary-quiet-text', '--sk-primary-quiet', 4.5], // audit R5
  ['--sk-brand',              '--sk-bg',            4.5], // audit R3
  ['--sk-brand',              '--sk-surface',       4.5], // audit R3
  ['--sk-link',               '--sk-surface',       4.5],
  ['--sk-success-text',       '--sk-success-bg',    4.5],
  ['--sk-warning-text',       '--sk-warning-bg',    4.5],
  ['--sk-danger-text',        '--sk-danger-bg',     4.5], // R4: Return to Defaults
  ['--sk-info-text',          '--sk-info-bg',       4.5],
];
// non-text pairs — fixed floors, never raised by AAA
const UI_PAIRS = [
  ['--sk-focus',  '--sk-surface', 3.0],
  ['--sk-focus',  '--sk-primary', 3.0],
  ['--sk-border', '--sk-surface', 1.5],
];
const SERIES = [1, 2, 3, 4, 5, 6].map(i => `--sk-series-${i}`);
const SERIES_MIN_DIST = 40;   // sRGB euclidean — catches near-duplicate ramps
const SERIES_MIN_ON_SURFACE = 3.0;
const AAA_SKINS = ['high-contrast-forest'];

/**
 * `default` reproduces today's shipped appearance exactly, so that installing
 * the skin system is a visual no-op. Today's appearance does not pass — the
 * audit found this itself (R7: "Even the untouched Default skin fails here").
 *
 * These three are therefore PINNED, not ignored: the exact current ratios are
 * recorded, so `default` cannot silently drift worse, and any NEW failure on
 * `default` still fails the build.
 *
 * Resolving them is a product decision, because each costs the no-op:
 *   --sk-focus  #0ea5e9 on #ffffff = 2.77  → needs a darker ring (visible change)
 *   --sk-focus  on --sk-primary    = 2.14  → same ring, against the sky fill
 *   --sk-border #e5e5e5 on #ffffff = 1.26  → needs a darker divider everywhere
 * Recommendation: fix the two focus ratios (a focus ring nobody can see is an
 * accessibility failure, and the change is confined to :focus-visible), and
 * leave the border as-is until someone owns the divider weight.
 */
const PINNED = {
  default: {
    '--sk-focus/--sk-surface':  2.77,
    '--sk-focus/--sk-primary':  2.14,
    '--sk-border/--sk-surface': 1.26,
  },
};
const PIN_TOLERANCE = 0.03;

function run() {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const skins = parseSkins(css);
  const ids = Object.keys(skins);
  if (!ids.length) throw new Error(`no [data-skin] blocks found in ${CSS_PATH}`);

  const failures = [];
  const pinned = [];
  const table = [];

  for (const id of ids) {
    const v = skins[id];
    const aaa = AAA_SKINS.includes(id);
    const get = k => {
      if (!v[k]) { failures.push(`${id}: missing ${k}`); return null; }
      if (!/^#[0-9a-f]{3,6}$/i.test(v[k])) return null; // channel triples etc.
      return parseHex(v[k]);
    };
    let worst = Infinity;

    for (const [fg, bg, min] of TEXT_PAIRS) {
      const a = get(fg), b = get(bg);
      if (!a || !b) continue;
      const need = aaa ? Math.max(min, 7) : min;
      const r = ratio(a, b);
      if (r < worst) worst = r;
      if (r < need) failures.push(`${id}: ${fg} on ${bg} = ${r.toFixed(2)} (need ${need})`);
    }
    for (const [fg, bg, min] of UI_PAIRS) {
      const a = get(fg), b = get(bg);
      if (!a || !b) continue;
      const r = ratio(a, b);
      if (r >= min) continue;
      const pin = PINNED[id] && PINNED[id][`${fg}/${bg}`];
      if (pin !== undefined) {
        // known legacy shortfall — allowed at its recorded value, no worse
        if (r < pin - PIN_TOLERANCE)
          failures.push(`${id}: ${fg} on ${bg} = ${r.toFixed(2)} — REGRESSED below its pinned ${pin}`);
        else pinned.push(`${id}: ${fg} on ${bg} = ${r.toFixed(2)} (pinned legacy, need ${min})`);
        continue;
      }
      failures.push(`${id}: ${fg} on ${bg} = ${r.toFixed(2)} (need ${min})`);
    }

    // series must be mutually distinguishable — Family Tree maps six pedigree
    // roles onto them, so two similar colours are two roles a user can't tell
    // apart (sire/dam/offspring/selected/sibling/ancestor)
    const cols = SERIES.map(get);
    if (cols.every(Boolean)) {
      let minD = Infinity;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
        const d = rgbDist(cols[i], cols[j]);
        if (d < minD) minD = d;
        if (d < SERIES_MIN_DIST)
          failures.push(`${id}: --sk-series-${i+1} and -${j+1} too close (rgb dist ${d.toFixed(0)}, need ${SERIES_MIN_DIST})`);
      }
      const su = get('--sk-surface');
      if (su) for (let i = 0; i < 6; i++) {
        const r = ratio(cols[i], su);
        if (r < SERIES_MIN_ON_SURFACE)
          failures.push(`${id}: --sk-series-${i+1} on --sk-surface = ${r.toFixed(2)} (need ${SERIES_MIN_ON_SURFACE})`);
      }
      table.push({ skin: id, aaa, worstText: worst, seriesMinDist: minD });
    }
  }

  return { pass: failures.length === 0, failures, pinned, table, skinCount: ids.length };
}

module.exports = { run, ratio, parseHex, parseSkins };

// ── standalone ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const { pass, failures, pinned, table, skinCount } = run();
  console.log(`\n${skinCount} skins in ${CSS_PATH}\n`);
  console.log('skin'.padEnd(24) + 'worst text  series min dist');
  for (const t of table) {
    console.log(
      (t.skin + (t.aaa ? ' *AAA' : '')).padEnd(24) +
      t.worstText.toFixed(2).padStart(10) +
      t.seriesMinDist.toFixed(0).padStart(17)
    );
  }
  if (pinned.length) {
    console.log(`\n${pinned.length} pinned legacy shortfall(s) on \`default\` — see PINNED in this file:`);
    pinned.forEach(p => console.log('  ' + p));
  }
  if (pass) { console.log('\n✓ all skins pass (pinned exceptions held at value)\n'); }
  else {
    console.log(`\n✗ ${failures.length} failure(s):`);
    failures.forEach(f => console.log('  ' + f));
    console.log('');
    process.exit(1);
  }
}

// ── vitest / jest ───────────────────────────────────────────────────────────
if (typeof describe === 'function') {
  const { table, failures } = run();
  describe('skins.css contrast contract', () => {
    for (const t of table) {
      it(`${t.skin} passes every pair`, () => {
        const mine = failures.filter(f => f.startsWith(t.skin + ':'));
        expect(mine).toEqual([]);
      });
    }
    it('has no unparseable or missing roles', () => {
      expect(failures.filter(f => /missing/.test(f))).toEqual([]);
    });
    it('no pinned legacy shortfall has regressed', () => {
      expect(failures.filter(f => /REGRESSED/.test(f))).toEqual([]);
    });
  });
}
