#!/usr/bin/env node
// Checks the Serpentora completion plan against the working tree.
// One small, honest check per plan item: a file exists, a string is gone,
// a dependency is present, a command passes. Read-only except for
// data/plan-status.json, which it writes every run.
//
//   node scripts/plan-check.mjs            full run (typecheck, tests, i18n verify included)
//   node scripts/plan-check.mjs --quick    skip the slow commands; those items report "unknown"
//   node scripts/plan-check.mjs --json     print only the JSON
//
// Statuses: pass | fail | manual | unknown. "manual" means only a person can
// know; tick it in the Prompts and Tracker page. A check is a heuristic, not a
// judge: if an item is done differently from what a check expects, change the
// check here rather than the work.

import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const jsonOnly = process.argv.includes('--json');

const pass = (detail) => ({ status: 'pass', detail });
const fail = (detail) => ({ status: 'fail', detail });
const manual = (detail) => ({ status: 'manual', detail });
const unknown = (detail) => ({ status: 'unknown', detail });

function run(cmd, cwd, timeout = 420000) {
  try {
    execSync(cmd, { cwd: path.join(root, cwd || '.'), stdio: 'pipe', timeout });
    return { ok: true };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.toString();
    return { ok: false, out: out.slice(-400) };
  }
}

// git grep over tracked working-tree content; returns matching paths.
function grep(pattern, paths, extended = false) {
  const args = ['grep', '-l', '-I'];
  if (extended) args.push('-E');
  else args.push('-F');
  args.push(pattern, '--', ...paths);
  try {
    const out = execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
    return out ? out.split('\n') : [];
  } catch {
    return []; // exit 1 = no matches
  }
}

function pkg(dir) {
  try { return JSON.parse(readFileSync(path.join(root, dir, 'package.json'), 'utf8')); }
  catch { return null; }
}

function stringsGone(id, strings, paths) {
  const hits = [];
  for (const s of strings) for (const f of grep(s, paths)) hits.push(`"${s}" in ${f}`);
  return hits.length === 0
    ? pass('none of the flagged strings remain')
    : fail(`still present: ${hits.slice(0, 3).join('; ')}${hits.length > 3 ? ` (+${hits.length - 3} more)` : ''}`);
}

const APPS = ['breeding-app-breeder', 'breeding-app-backend', 'breeding-app-lab', 'breeding-app-marketplace', 'breeding-app-admin'];
const slow = (label, fn) => (quick ? unknown(`skipped (--quick): ${label}`) : fn());

const checks = {
  // ---- Part 1 · Finish what exists ----
  't-typecheck': () => slow('tsc in breeding-app-breeder', () => {
    const r = run('npx tsc --noEmit', 'breeding-app-breeder');
    if (r.ok) return pass('tsc --noEmit exits 0 in breeding-app-breeder');
    const line = (r.out.split('\n').find((l) => l.includes('error TS')) || 'tsc reports errors').trim();
    return fail(`tsc fails: ${line.slice(0, 160)}`);
  }),
  // The timeout only reproduces inside a full suite run, so this runs the two
  // small apps' whole suites (fast) rather than the test file in isolation.
  't-lang-test': () => slow('npm test in marketplace and admin', () => {
    const mp = run('npm test', 'breeding-app-marketplace');
    const ad = run('npm test', 'breeding-app-admin');
    return mp.ok && ad.ok
      ? pass('marketplace and admin suites green (spot-check for the shared default-language fix)')
      : fail(`npm test still fails in ${[!mp.ok && 'marketplace', !ad.ok && 'admin'].filter(Boolean).join(' and ')} (default-language.test.js is the known offender)`);
  }),
  't-lint': () => {
    const missing = APPS.filter((a) => !(pkg(a)?.scripts?.lint));
    if (missing.length) return fail(`no lint script in ${missing.join(', ')}`);
    const hasConfig = ['eslint.config.js', 'eslint.config.mjs'].some((f) => existsSync(path.join(root, f)))
      || APPS.some((a) => ['eslint.config.js', 'eslint.config.mjs'].some((f) => existsSync(path.join(root, a, f))));
    return hasConfig ? pass('lint scripts and an ESLint config exist') : fail('lint scripts exist but no eslint.config.* found');
  },
  't-ci-green': () => manual('confirm three consecutive green runs of Dependency CI Foundation on GitHub'),
  't-root-retire': () => {
    const problems = [];
    if (existsSync(path.join(root, 'tests'))) problems.push('orphaned root tests/ still exists');
    try {
      if (!readFileSync(path.join(root, 'README.md'), 'utf8').includes('breeding-app-breeder')) problems.push('README.md does not describe the breeding-app-* layout');
    } catch { problems.push('README.md unreadable'); }
    return problems.length ? fail(problems.join('; ')) : pass('root tests/ gone and README names the real layout');
  },
  't-rename': () => stringsGone('t-rename',
    ['Zuchtplaner', 'Kweekplanner', 'breedingplanner'],
    ['breeding-app-breeder/src', 'breeding-app-lab/src', 'breeding-app-marketplace/src', 'breeding-app-admin/src', 'breeding-app-public/src', 'breeding-app-breeder/capacitor.config.ts', 'breeding-app-lab/capacitor.config.ts']),
  't-dev-text': () => stringsGone('t-dev-text',
    ['npm install xlsx', 'saved locally for this demo', 'Set `VITE_GOOGLE_CLIENT_ID`'],
    ['breeding-app-breeder/src']),
  't-shared-pkg': () => {
    const takers = ['breeding-app-breeder', 'breeding-app-lab'].filter((a) => {
      const p = pkg(a);
      return p && ((p.dependencies && p.dependencies['breeding-app-shared']) || (p.devDependencies && p.devDependencies['breeding-app-shared']));
    });
    return takers.length === 2
      ? pass('breeder and lab depend on breeding-app-shared')
      : fail(`not yet a dependency of ${['breeding-app-breeder', 'breeding-app-lab'].filter((a) => !takers.includes(a)).join(', ')}`);
  },
  't-limits-honest': () => {
    const users = grep('FeatureAccessGuard', ['breeding-app-breeder/src'])
      .filter((f) => !f.endsWith('FeatureAccessGuard.jsx'));
    return users.length > 0
      ? pass(`FeatureAccessGuard used in ${users.length} file(s)`)
      : fail('FeatureAccessGuard is still imported nowhere outside its own file');
  },
  't-sync-defects': () => manual('tick when both sync defects (413 payloads, lost 26-F-186) have a written cause and a regression test'),
  't-env-split': () => manual('tick when serpentora.com reads a production database and nothing public reads staging'),
  't-seeded-admins': () => manual('tick when the four seeded staging accounts have a recorded, applied decision'),
  't-email-live': () => manual('tick when a signup confirmation reaches a real inbox from the deployed backend'),

  // ---- Part 2 · Open the doors ----
  'f-cert-lookup': () => {
    const page = existsSync(path.join(root, 'breeding-app-public/src/pages/VerifyCertificatePage.jsx'));
    const route = grep('public/certificates/verify', ['breeding-app-backend/src']).length > 0;
    if (page && route) return pass('public verify page and unauthenticated backend route exist');
    return fail(`missing: ${[!route && 'backend route public/certificates/verify', !page && 'VerifyCertificatePage.jsx'].filter(Boolean).join(' and ')}`);
  },
  't-site-truth': () => stringsGone('t-site-truth',
    ['Start for free', 'Get started free', '14-day', 'Start free trial', 'Export directly to MorphMarket'],
    ['breeding-app-public/src']),
  't-mp-cors': () => existsSync(path.join(root, 'breeding-app-backend/src/tests/corsMarketplace.test.ts'))
    ? pass('corsMarketplace.test.ts exists')
    : fail('no corsMarketplace.test.ts; the marketplace origin is likely still missing from CORS'),
  'f-mp-publish': () => {
    // The account data export must still cover the frozen legacy table until it is
    // dropped (no earlier than 2027-01-05, see listingRoutes.ts), so that one read
    // is not a product read.
    const exportReader = 'breeding-app-backend/src/services/accountDataExportService.ts';
    const hits = grep('/api/listings', ['breeding-app-marketplace/src', 'breeding-app-breeder/src'])
      .concat(grep('prisma.listing.', ['breeding-app-backend/src']).filter((f) => f !== exportReader));
    return hits.length === 0
      ? pass('nothing reads the legacy Listing store, frontend or backend (the account data export aside)')
      : fail(`legacy Listing store still read by ${hits.slice(0, 2).join(', ')}${hits.length > 2 ? ` (+${hits.length - 2})` : ''}`);
  },
  'f-mp-buyer': () => existsSync(path.join(root, 'breeding-app-marketplace/tests/e2e/buyer-journey.spec.ts'))
    ? pass('buyer-journey.spec.ts exists')
    : fail('no tests/e2e/buyer-journey.spec.ts in the marketplace app'),
  'f-mp-sales': () => existsSync(path.join(root, 'breeding-app-backend/src/services/marketplaceSaleService.ts'))
    ? pass('marketplaceSaleService.ts exists')
    : fail('no marketplaceSaleService.ts (sale + record transfer not built)'),
  'f-payments': () => {
    const p = pkg('breeding-app-backend');
    const dep = p && p.dependencies && p.dependencies.stripe;
    const routes = existsSync(path.join(root, 'breeding-app-backend/src/routes/billingRoutes.ts'));
    if (dep && routes) return pass('stripe dependency and billingRoutes.ts exist');
    return fail(`missing: ${[!dep && 'stripe dependency', !routes && 'billingRoutes.ts'].filter(Boolean).join(' and ')}`);
  },
  'f-lab-onboard': () => existsSync(path.join(root, 'breeding-app-backend/src/tests/labOnboarding.test.ts'))
    ? pass('labOnboarding.test.ts exists (onboard the real partner lab yourself, then tick it)')
    : fail('no labOnboarding.test.ts; the invite-to-first-result flow is not proven'),
  't-site-live': () => manual('tick when serpentora.com serves the marketing site, /terms and /privacy resolve, and an old verification email still works'),
  't-ios-decide': () => manual('tick when the iOS decision is recorded and the copy matches it'),
  'f-i18n-complete': () => slow('npm run i18n:verify:apps', () => {
    const r = run('npm run i18n:verify:apps', '.');
    return r.ok ? pass('i18n:verify:apps exits 0') : fail('i18n:verify:apps reports missing keys');
  }),

  // ---- Part 3 · Gentle to newcomers ----
  'f-first-hour': () => existsSync(path.join(root, 'breeding-app-breeder/tests/e2e/first-run-import.spec.ts'))
    ? pass('first-run-import.spec.ts exists')
    : fail('no tests/e2e/first-run-import.spec.ts in the breeder app'),
  't-breeders-gate': () => stringsGone('t-breeders-gate',
    ['Add at least one male and one female to the Breeders group'],
    ['breeding-app-breeder/src']),
  't-one-word': () => stringsGone('t-one-word',
    ['For sell', 'Import snakes from text'],
    ['breeding-app-breeder/src']),
  't-quarantine-default': () => existsSync(path.join(root, 'breeding-app-breeder/src/features/animals/quarantineDefault.test.ts'))
    ? pass('quarantineDefault.test.ts exists')
    : fail('no quarantineDefault.test.ts; bulk entry likely still defaults to quarantine'),
  't-phone-web': () => {
    try {
      const css = readFileSync(path.join(root, 'breeding-app-breeder/src/App.css'), 'utf8');
      return /bp-toolbar-right[^}]*display:\s*none/s.test(css)
        ? fail('App.css still hides .bp-toolbar-right (and Import with it) at phone widths')
        : pass('the phone-width toolbar is no longer display:none');
    } catch { return unknown('App.css not readable'); }
  },
  'f-mobile-parity': () => {
    // Since PR 26 the Android shell mounts the same App as the web (features/mobile is gone),
    // so parity holds when no separate mobile app exists and AppEntry renders the translated App.
    const src = 'breeding-app-breeder/src';
    if (existsSync(path.join(root, src, 'features/mobile'))) {
      return grep('useTranslation', [`${src}/features/mobile`]).length > 0
        ? pass('MobileApp uses i18n (spot-check register/add/pair on a device too)')
        : fail('features/mobile has no useTranslation; the Android app is still hardcoded English');
    }
    try {
      const entry = readFileSync(path.join(root, src, 'AppEntry.jsx'), 'utf8');
      const app = readFileSync(path.join(root, src, 'App.jsx'), 'utf8');
      const problems = [];
      if (/MobileApp/.test(entry)) problems.push('AppEntry still mounts a separate MobileApp');
      if (!/from "\.\/App\.jsx"/.test(entry)) problems.push('AppEntry does not render App.jsx');
      if (!app.includes('useTranslation')) problems.push('App.jsx has no useTranslation');
      return problems.length === 0
        ? pass('Android runs the same translated App as the web (spot-check register/add/pair on a device too)')
        : fail(problems.join('; '));
    } catch { return unknown('AppEntry.jsx or App.jsx not readable'); }
  },
  'f-help-system': () => {
    const src = 'breeding-app-breeder/src';
    const missing = [];
    if (!existsSync(path.join(root, src, 'features/help/registry.ts'))) missing.push('help registry (features/help/registry.ts)');
    if (grep('export function installHelpGuard', [src]).length === 0 && grep('export const installHelpGuard', [src]).length === 0) missing.push('installHelpGuard');
    if (grep('export function useTourEngine', [src]).length === 0) missing.push('tour engine (useTourEngine)');
    if (grep('OWN_TARGETS', [src]).filter((f) => /\.test\.[jt]sx?$/.test(f)).length === 0) missing.push('OWN_TARGETS test');
    return missing.length === 0
      ? pass('help registry, installHelpGuard, tour engine and the OWN_TARGETS test exist')
      : fail(`missing: ${missing.join(', ')}`);
  },
  't-user-test': () => manual('tick when five keepers reached a confirmed import unaided and the notes are saved'),
  't-device-test': () => manual('tick when the breeder and lab APKs were exercised on real hardware'),
};

// ---- run ----
const items = {};
for (const [id, fn] of Object.entries(checks)) {
  try { items[id] = fn(); }
  catch (e) { items[id] = unknown(`check crashed: ${String(e).slice(0, 120)}`); }
}

const sh = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: 'pipe' }).toString().trim(); } catch { return ''; } };
const summary = { pass: 0, fail: 0, manual: 0, unknown: 0, total: Object.keys(items).length };
for (const it of Object.values(items)) summary[it.status]++;

const result = {
  ranAt: new Date().toISOString(),
  commit: sh('git rev-parse --short HEAD'),
  branch: sh('git rev-parse --abbrev-ref HEAD'),
  dirtyPaths: sh('git status --porcelain').split('\n').filter(Boolean).length,
  quick,
  summary,
  items,
};

mkdirSync(path.join(root, 'data'), { recursive: true });
writeFileSync(path.join(root, 'data', 'plan-status.json'), JSON.stringify(result, null, 2) + '\n');

if (jsonOnly) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const order = { fail: 0, unknown: 1, manual: 2, pass: 3 };
  const rows = Object.entries(items).sort((a, b) => order[a[1].status] - order[b[1].status] || a[0].localeCompare(b[0]));
  const mark = { pass: 'PASS   ', fail: 'FAIL   ', manual: 'MANUAL ', unknown: 'UNKNOWN' };
  for (const [id, it] of rows) console.log(`${mark[it.status]} ${id.padEnd(22)} ${it.detail}`);
  console.log(`\n${summary.pass} pass · ${summary.fail} fail · ${summary.manual} manual · ${summary.unknown} unknown` +
    ` · ${result.commit} on ${result.branch} · ${result.dirtyPaths} uncommitted paths${quick ? ' · quick run' : ''}`);
  console.log('Written to data/plan-status.json');
}
