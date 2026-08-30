/**
 * materials.compat.test.js
 * Guards the material layer's two real failure modes.
 *
 *   node materials.compat.test.js       → prints the matrix, exits 1 on failure
 *   vitest run materials.compat         → one assertion per material
 *
 * WHAT THIS CAN AND CANNOT CHECK
 * The skin test measures colour pairs, because skins.css is literal hex. The
 * material layer is mostly color-mix(), box-shadow and background-blend-mode —
 * none of which resolve without a browser. So this file checks STRUCTURE (does
 * every material declare the full contract) and POLICY (is every pairing the
 * app can reach one we have actually blessed).
 *
 * The perceptual half needs a real browser. See MATERIALS.md § Verifying —
 * point the DOM audit script at the pairs marked `review` below.
 */

const fs = require('fs');
const path = require('path');

const MATERIALS_CSS = process.env.MATERIALS_CSS
  || path.join(__dirname, '..', 'styles', 'materials.css');
const SKINS_CSS = process.env.SKINS_CSS
  || path.join(__dirname, '..', 'styles', 'skins.css');

/** Every material must declare all of these, or a skin×material pair silently
 *  falls back to the flat :root default and looks broken in one place only. */
const REQUIRED = [
  '--mt-tone',
  '--mt-radius-shell', '--mt-radius-card', '--mt-radius-control', '--mt-radius-chip',
  '--mt-shell-bg', '--mt-card-bg', '--mt-well-bg',
  '--mt-bevel-card', '--mt-bevel-control', '--mt-bevel-well',
  '--mt-lift-card', '--mt-lift-shell', '--mt-lift-control',
  '--mt-font-display',
];

/** The compatibility policy. This is a DESIGN decision encoded as a test, not
 *  a measurement — it says which pairs we are willing to ship.
 *
 *  ok      — ships
 *  review  — ships only after a human looks at it; the DOM audit must pass
 *  no      — actively bad, the picker must not offer it
 */
const POLICY = {
  // paper materials put a LIGHT card face under body text by definition.
  // On a dark skin that is light cards in a dark room — legible (the material
  // supplies its own ink) but a different product than the skin promises.
  vellum:            { tone: 'paper',   dark: 'review', light: 'ok',     hc: 'no' },
  journal:           { tone: 'paper',   dark: 'review', light: 'ok',     hc: 'no' },
  vitrine:           { tone: 'paper',   dark: 'ok',     light: 'review', hc: 'no' },
  rattan:            { tone: 'paper',   dark: 'review', light: 'ok',     hc: 'no' },

  // surface materials follow the skin's own lightness.
  'terrarium-glass': { tone: 'surface', dark: 'ok',     light: 'no',     hc: 'no' },
  soapstone:         { tone: 'surface', dark: 'ok',     light: 'review', hc: 'ok' },
  blueprint:         { tone: 'surface', dark: 'ok',     light: 'no',     hc: 'no' },
  lacquer:           { tone: 'surface', dark: 'ok',     light: 'no',     hc: 'no' },
  basalt:            { tone: 'surface', dark: 'ok',     light: 'review', hc: 'ok' },

  // moss-relief is low contrast BY CONSTRUCTION. Pairing it with the AAA skin
  // asks for the opposite of what each is for.
  'moss-relief':     { tone: 'surface', dark: 'ok',     light: 'review', hc: 'no' },
};

const LIGHT_SKINS = ['default', 'bamboo-daylight', 'sandstone-vivarium', 'glasshouse-mint', 'field-daylight'];
const HC_SKINS = ['high-contrast-forest'];

function parseBlocks(css, attr) {
  const out = {};
  const re = new RegExp(`\\[${attr}="([^"]+)"\\]\\s*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(css))) {
    const vars = out[m[1]] || (out[m[1]] = {});
    for (const line of m[2].split(';')) {
      const kv = line.match(/(--[a-z0-9-]+)\s*:\s*([^;]+)/i);
      if (kv) vars[kv[1]] = kv[2].trim();
    }
  }
  return out;
}

function run() {
  const mcss = fs.readFileSync(MATERIALS_CSS, 'utf8');
  const scss = fs.readFileSync(SKINS_CSS, 'utf8');

  const materials = parseBlocks(mcss, 'data-material');
  const skins = Object.keys(parseBlocks(scss, 'data-skin'));
  const failures = [];
  const rows = [];

  const declared = Object.keys(materials);

  // 1. every material in POLICY exists in the CSS, and vice versa — a picker
  //    offering a material with no block renders the flat fallback
  for (const id of Object.keys(POLICY))
    if (!declared.includes(id)) failures.push(`POLICY lists "${id}" but materials.css has no [data-material="${id}"] block`);
  for (const id of declared)
    if (!POLICY[id]) failures.push(`materials.css declares "${id}" with no POLICY entry — every material needs a stated compatibility`);

  // 2. contract completeness
  for (const id of declared) {
    const missing = REQUIRED.filter(k => !materials[id][k]);
    if (missing.length) failures.push(`${id}: missing ${missing.join(', ')}`);
    const tone = (materials[id]['--mt-tone'] || '').trim();
    if (tone && POLICY[id] && tone !== POLICY[id].tone)
      failures.push(`${id}: --mt-tone is "${tone}" but POLICY says "${POLICY[id].tone}"`);
  }

  // 3. no material hardcodes a hue where the skin should supply it. The paper
  //    materials legitimately name their own paper and ink, so they're exempt
  //    for those two roles only.
  for (const id of declared) {
    const shell = materials[id]['--mt-shell-bg'] || '';
    const paper = POLICY[id] && POLICY[id].tone === 'paper';
    const usesSkin = /var\(--sk-|var\(--mt-(paper|board|cane|case|brass|mount)/.test(shell);
    if (!usesSkin)
      failures.push(`${id}: --mt-shell-bg "${shell}" derives from neither a skin role nor a named material tint`);
    if (!paper && /#[0-9a-f]{3,6}/i.test(shell) && !/color-mix/.test(shell))
      failures.push(`${id}: surface material hardcodes a hex in --mt-shell-bg; mix over var(--sk-bg) instead`);
  }

  // 4. the matrix
  let counts = { ok: 0, review: 0, no: 0 };
  for (const id of declared) {
    const p = POLICY[id]; if (!p) continue;
    const row = { material: id, tone: p.tone, ok: [], review: [], no: [] };
    for (const s of skins) {
      const kind = HC_SKINS.includes(s) ? 'hc' : LIGHT_SKINS.includes(s) ? 'light' : 'dark';
      row[p[kind]].push(s);
      counts[p[kind]]++;
    }
    rows.push(row);
  }

  return { pass: failures.length === 0, failures, rows, counts, skins, materials: declared };
}

module.exports = { run, POLICY, REQUIRED };

if (require.main === module) {
  const { pass, failures, rows, counts, skins, materials } = run();
  console.log(`\n${materials.length} materials × ${skins.length} skins = ${materials.length * skins.length} pairs\n`);
  console.log('material'.padEnd(18) + 'tone'.padEnd(9) + 'ok'.padStart(4) + 'review'.padStart(8) + 'no'.padStart(4));
  for (const r of rows)
    console.log(r.material.padEnd(18) + r.tone.padEnd(9)
      + String(r.ok.length).padStart(4) + String(r.review.length).padStart(8) + String(r.no.length).padStart(4));
  console.log('\n' + `ships: ${counts.ok} · needs review: ${counts.review} · blocked: ${counts.no}`);
  console.log('\nPairs marked `review` must be checked with the DOM audit script before shipping.');
  console.log('Pairs marked `no` must not appear in the picker — see getAllowedMaterials() in MATERIALS.md.\n');
  if (!pass) {
    console.log(`✗ ${failures.length} structural failure(s):`);
    failures.forEach(f => console.log('  ' + f));
    console.log('');
    process.exit(1);
  }
  console.log('✓ material contract intact\n');
}

if (typeof describe === 'function') {
  const { failures, rows } = run();
  describe('material layer contract', () => {
    for (const r of rows) {
      it(`${r.material} declares the full contract`, () => {
        expect(failures.filter(f => f.startsWith(r.material + ':'))).toEqual([]);
      });
    }
    it('POLICY and materials.css agree on the material list', () => {
      expect(failures.filter(f => /POLICY|no POLICY/.test(f))).toEqual([]);
    });
  });
}
