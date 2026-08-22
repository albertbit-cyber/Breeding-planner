// Generates a self-contained local HTML viewer for the generated species database.
//
//   node scripts/species/buildPreview.mjs [outputPath]
//
// This is a data preview, NOT the app. It renders exactly what
// breeding-app-shared/src/config/species/ contains so the tables can be reviewed before
// any of it is wired into the genetics engine. All data is inlined, so the file opens
// straight from disk with no server and no node_modules.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const DATA_DIR = join(REPO, 'breeding-app-breeder', 'src', 'config', 'species');

const outPath = resolve(process.argv[2] || join(REPO, 'species-preview.html'));

const index = JSON.parse(readFileSync(join(DATA_DIR, 'index.json'), 'utf8'));
const tables = {};
for (const file of readdirSync(DATA_DIR)) {
  if (file === 'index.json' || !file.endsWith('.json')) continue;
  const doc = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
  tables[doc.speciesId] = doc.genes;
}

const payload = JSON.stringify({ index, tables }).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Species database preview</title>
<style>
  :root {
    --bg:#0f1115; --panel:#161a21; --line:#252b36; --text:#e6e9ef; --dim:#8b94a7;
    --accent:#5b9dff;
    --recessive:#7c5cff; --incomplete_dominant:#2f9e6e; --dominant:#c2843a;
    --polygenic:#c05b8c; --locality:#3f7fa6; --physical:#8a8f9c; --other:#6b7280;
  }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 ui-sans-serif,system-ui,"Segoe UI",sans-serif;
         background:var(--bg); color:var(--text); }
  header { padding:18px 22px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 4px; font-size:17px; font-weight:600; }
  .sub { color:var(--dim); font-size:12.5px; }
  .warn { margin-top:10px; padding:8px 11px; border-radius:6px; font-size:12.5px;
          background:#2a2113; border:1px solid #5c4620; color:#e8c98a; }
  .wrap { display:flex; min-height:calc(100vh - 92px); }
  aside { width:290px; flex:none; border-right:1px solid var(--line); overflow-y:auto;
          max-height:calc(100vh - 92px); }
  .grp { padding:11px 18px 5px; font-size:10.5px; letter-spacing:.09em;
         text-transform:uppercase; color:var(--dim); }
  .sp { display:flex; justify-content:space-between; gap:8px; align-items:center;
        padding:6px 18px; cursor:pointer; border-left:2px solid transparent; }
  .sp:hover { background:var(--panel); }
  .sp.on { background:var(--panel); border-left-color:var(--accent); }
  .sp.empty { color:#5c6474; cursor:default; }
  .sp.empty:hover { background:none; }
  .n { font-size:11px; color:var(--dim); font-variant-numeric:tabular-nums; }
  main { flex:1; padding:20px 24px; overflow-y:auto; max-height:calc(100vh - 92px); }
  .title { font-size:19px; font-weight:600; }
  .latin { font-style:italic; color:var(--dim); font-size:13px; margin-left:7px; }
  .meta { color:var(--dim); font-size:12.5px; margin:5px 0 15px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:15px; }
  .chip { font-size:11.5px; padding:2px 9px; border-radius:99px;
          border:1px solid var(--line); background:var(--panel); color:var(--dim); }
  input { width:100%; max-width:340px; padding:7px 11px; margin-bottom:13px;
          background:var(--panel); border:1px solid var(--line); border-radius:6px;
          color:var(--text); font-size:13px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:10.5px; letter-spacing:.07em; text-transform:uppercase;
       color:var(--dim); font-weight:600; padding:0 10px 7px; border-bottom:1px solid var(--line); }
  td { padding:7px 10px; border-bottom:1px solid #1c212a; vertical-align:top; }
  tr:hover td { background:#12161d; }
  .tag { display:inline-block; font-size:11px; padding:1px 8px; border-radius:4px;
         color:#fff; white-space:nowrap; }
  .dimtxt { color:var(--dim); }
  .extra { font-size:11.5px; color:var(--dim); margin-top:3px; }
  .flag { display:inline-block; font-size:10.5px; padding:0 6px; border-radius:3px;
          background:#3a2a12; color:#e0b872; margin-left:6px; }
  .empty-state { color:var(--dim); padding:34px 0; }
  code { background:var(--panel); padding:1px 5px; border-radius:3px; font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>Species database preview</h1>
  <div class="sub" id="sub"></div>
  <div class="warn">Preview of the generated data files only &mdash; this is not the app.
  Nothing here is wired into the genetics engine yet.</div>
</header>
<div class="wrap">
  <aside id="side"></aside>
  <main id="main"></main>
</div>
<script>
const DATA = ${payload};
const LABEL = { recessive:'Recessive', incomplete_dominant:'Incomplete Dominant',
  dominant:'Dominant', polygenic:'Polygenic', locality:'Locality', physical:'Physical',
  other:'Other' };
const withTraits = DATA.index.species.filter(s => s.traitsFile);
document.getElementById('sub').textContent =
  DATA.index.species.length + ' species across ' + DATA.index.groups.length + ' groups \\u00b7 '
  + withTraits.length + ' with trait tables \\u00b7 '
  + withTraits.reduce((n,s) => n + s.traitCount, 0) + ' traits \\u00b7 source: ' + DATA.index.source;

let current = 'ball-python', filter = '';

const side = document.getElementById('side');
DATA.index.groups.forEach(g => {
  const h = document.createElement('div');
  h.className = 'grp';
  h.textContent = g.name;
  side.appendChild(h);
  g.speciesIds.forEach(id => {
    const s = DATA.index.species.find(x => x.id === id);
    const row = document.createElement('div');
    row.className = 'sp' + (s.traitsFile ? '' : ' empty') + (id === current ? ' on' : '');
    row.innerHTML = '<span>' + s.name + '</span><span class="n">'
      + (s.traitsFile ? s.traitCount : '&mdash;') + '</span>';
    if (s.traitsFile) row.onclick = () => { current = id; filter = ''; render(); };
    row.dataset.id = id;
    side.appendChild(row);
  });
});

function render() {
  document.querySelectorAll('.sp').forEach(el =>
    el.classList.toggle('on', el.dataset.id === current));
  const s = DATA.index.species.find(x => x.id === current);
  const genes = DATA.tables[current] || [];
  const q = filter.trim().toLowerCase();
  const shown = q ? genes.filter(g => g.geneName.toLowerCase().includes(q)) : genes;

  const counts = {};
  genes.forEach(g => counts[g.geneType] = (counts[g.geneType] || 0) + 1);

  const rows = shown.map(g => {
    const bits = [];
    if (g.aliases && g.aliases.length) bits.push('aka ' + g.aliases.join(', '));
    if (g.shorthand && g.shorthand.length) bits.push('[' + g.shorthand.join(', ') + ']');
    if (g.complex) bits.push('complex: ' + g.complex);
    if (g.hasSuperForm) bits.push('super: ' + (g.superGeneName || 'yes'));
    if (g.healthFlags && g.healthFlags.length) bits.push('health: ' + g.healthFlags.join(', '));
    if (g.notes) bits.push(g.notes);
    let flag = '';
    if (g.sourceOnlyInCurated) flag = '<span class="flag">curated only</span>';
    if (g.sourceOnlyInMorphpedia) flag = '<span class="flag">Morphpedia only</span>';
    return '<tr><td><strong>' + g.geneName + '</strong>' + flag
      + (bits.length ? '<div class="extra">' + bits.join(' &middot; ') + '</div>' : '')
      + '</td><td><span class="tag" style="background:var(--' + g.geneType + ')">'
      + LABEL[g.geneType] + '</span></td>'
      + '<td class="dimtxt">' + (g.yearDiscovered || '&mdash;') + '</td>'
      + '<td class="dimtxt">' + (g.rarity || '&mdash;') + '</td></tr>';
  }).join('');

  document.getElementById('main').innerHTML =
    '<div class="title">' + s.name
      + (s.scientificName ? '<span class="latin">' + s.scientificName + '</span>' : '') + '</div>'
    + '<div class="meta">' + s.groupName + ' \\u00b7 ' + genes.length + ' traits \\u00b7 '
      + (s.reproduction === 'live_bearing' ? 'live-bearing' : 'egg-laying')
      + (s.variants.length ? ' \\u00b7 ' + s.variants.length + ' variants' : '') + '</div>'
    + '<div class="chips">' + Object.keys(LABEL).filter(k => counts[k])
        .map(k => '<span class="chip">' + LABEL[k] + ' ' + counts[k] + '</span>').join('') + '</div>'
    + '<input id="f" placeholder="Filter traits\\u2026" value="' + filter.replace(/"/g,'&quot;') + '">'
    + (shown.length
        ? '<table><thead><tr><th>Trait</th><th>Inheritance</th><th>Year</th><th>Rarity</th>'
          + '</tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="empty-state">No trait matches <code>' + filter + '</code>.</div>');

  const f = document.getElementById('f');
  f.oninput = e => { filter = e.target.value; render(); f.focus(); };
  if (filter) { f.focus(); f.setSelectionRange(filter.length, filter.length); }
}
render();
</script>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`Preview written to ${outPath}`);
console.log(`  ${index.species.length} species, ${Object.keys(tables).length} trait tables inlined`);
