# Breeding upgrade tracker (SBR-00 .. SBR-12)

Specification: `docs/handoff/Serpentora-Breeding-Master-Prompt.md` (SBR-MASTER-01, rev 1, 11 Oct 2026).
Workspace page: `docs/handoff/SBR-breeding-upgrade-workspace.html` (the running record; this file is
the repo copy of the same status with the implementation evidence).

Branch: `feature/breeding-cards`, worktree `.claude/worktrees/breeding-cards`, based on `9aa5818`.
Status of the whole: **implemented locally and verified locally; not merged, not deployed.**

## Stage 0 audit (SBR-00) — done

Found at `9aa5818` (2026-10-11):

- Breeder app (`breeding-app-breeder`, React/Vite, one 29k-line `App.jsx`) is local-first:
  `pairings` live in localStorage and sync as JSON payloads to the backend
  (`PUT /api/breeder/snapshot`, `breederDataService.ts`). A pairing = female × male × appointments
  (`appointmentDone`, `pairingDate`, `lockObserved`, `lockDate`) + `ovulation/preLayShed/clutch/hatch`
  objects + workflow completion metadata. One active pairing per female was enforced in the UI.
- Backend (`breeding-app-backend`, Express + Prisma 6.5 + Postgres): `Pairing`/`Clutch` rows with JSON
  payloads; `ReproductiveCycle`/`LockEvent`/`ReproductiveAnalyticsCache` derived by ingestion from
  pairing payloads (`reproductiveCycleService.ts`), served by `/api/reproductive/female/:id` and
  shown in the animal editor (`ReproductiveIntelligencePanel`). Lock dedupe was per female per day.
- No follicle model, chart, or examination record existed. Reminders: in-app Calendar (derived from
  appointments), Google Calendar/ICS export, and the email queue (`breeding_reminder` template, used
  for the expected egg-laying window). Species registry carries `reproduction: egg_laying|live_bearing`.
- Clients with breeding features: breeder web app (also Electron desktop and the Capacitor Android
  wrapper of the same code), and the breeder app's "mobile mode" (`MobileApp.jsx`, read/write of the
  same snapshot). Lab, admin, marketplace apps have none.
- Languages: 10 (en, es, fr, it, de, nl, pl, pt, cs, he); CI fails on any key missing from any
  language (`scripts/check-app-locales.cjs`). Tests: vitest per app, Playwright e2e per app, CI
  `dependency-ci.yml` runs lint, locale check, unit tests, builds and the deterministic e2e.
- Baseline at `9aa5818`: breeder unit 712 passed (52 files), backend unit green, lint clean.
- Consumers of pairing ids / single-sire fields: hatch wizard (`pairingId`, `sireId` on hatchlings),
  clutch cards and incubator, Calendar, animal editor pairing overview, exports (pairing CSV/XLSX),
  family tree (`pairingId`/`clutchId`), backend reproductive ingestion, mobile mode, backup files.

## Per-stage status

| ID | Stage | Status | Evidence |
|---|---|---|---|
| SBR-00 | Audit + tracker | done | this file; workspace page rev 3 |
| SBR-01 | Female cycle model | done | `features/breeding/domain/cycleModel.js`; tests A, B, L, O |
| SBR-02 | Data, integrity, migration | done (local DB verified) | Prisma models, migration `20261011120000_*`, `breedingCycleSyncService.ts`, `legacyMigration.js`, script, runbook; tests P, Q |
| SBR-03 | Breeding card + multiple sires | done | `components/BreedingCard.jsx`; test G; browser pass |
| SBR-04 | Sessions + lock counting | done | `cycleModel.js` counting rule; tests C, D, E |
| SBR-05 | Quick entry + reminders | done | `BreedingDialogs.jsx`, `followUps.js`, email sync; test F |
| SBR-06 | Follicle exams + trends | done | `follicles.js`, `FollicleExamDialog`; tests I, J, K |
| SBR-07 | Chart + timeline | done | `FollicleChart.jsx` (SVG + table), `CycleTimeline.jsx`; test R (browser) |
| SBR-08 | History + female pace | done | `history.js`, `PreviousCycles.jsx`; test M |
| SBR-09 | Review rules + forecasts | done | `reviewRules.js`, `BreedingSettingsPanel.jsx` |
| SBR-10 | Sires, genetics, outcomes | done | offspring linking, sire assignment, hatch wizard reuse; test N, O |
| SBR-11 | Overview + integration | done | `FollicleOverviewSection.jsx`, calendar, animal editor, mobile read-only, exports, backups, `/api/breeding/*` |
| SBR-12 | Verification + docs | done locally | see "Checks executed" |

## What was built

Domain (`breeding-app-breeder/src/features/breeding/domain/`, pure JS, 59 tests):
`dates.js` (date-only arithmetic, calendar-month clamping), `season.js`, `cycleModel.js` (cycle,
sessions, dated lock records, milestones with precision/certainty, clutch, offspring, status
transitions, chronology and duplicate flags), `followUps.js` (one-calendar-month proposal, dedupe,
suppression, reschedule/skip/cancel, review after ovulation), `follicles.js` (exam model, validation,
comparable change, series, association with cycles), `history.js` (per-cycle intervals, pairing
frequency, medians/ranges/sample counts, comparison), `reviewRules.js` (settings per species/female,
review prompts, history-based windows with eligibility), `legacyMigration.js` (rerun-safe mapping with
report), `timeline.js`, `sync.js` (sanitize/merge for the sync).

UI (`features/breeding/`): `BreedingWorkspace.jsx` (dialog host, rack-walk batch), `BreedingCard.jsx`,
`BreedingCardsSection.jsx`, `FollicleOverviewSection.jsx`, `FollicleChart.jsx`, `CycleTimeline.jsx`,
`PreviousCycles.jsx` (+ `FemaleStatistics`), `BreedingSettingsPanel.jsx`, `BreedingDialogs.jsx`
(quick pairing, lock, follicle exam, milestone, clutch, hatching/complete, close, planned pairing,
sire assignment), `AnimalBreedingPanels.jsx` (female + male panels in the animal editor),
`useBreedingActions.js`.

App integration (`App.jsx`): new `breedingCycles`, `follicleExams`, `breedingSettings` state with
localStorage persistence, Electron bridge payload, backup/restore, cloud sync (snapshot upload,
merge, delta deletions, changed-only ack), tombstones; legacy pairing → card mapping on load;
pre-pairing scan association; hatchling → card offspring linking; Breeding tab views "Breeding cards"
(default) and "Follicle tracking"; Calendar entries (sessions, locks, planned pairings, milestones,
scans, due checks) with a filter; deep link `#cycle=<id>`; hatch wizard reuse for card hatchlings.
Mobile mode shows cards read-only in the Breeding panel.

Backend: Prisma models `BreedingCycle`, `FollicleExamination` (+ migration with partial unique
index for one active cycle per female); `breedingCycleSyncService.ts` (reference validation,
nested merge, duplicate-active resolution, planned-pairing email reminders, idempotent);
`breederDataService.ts` carries both collections (full + delta snapshots, tombstones, changed ack);
`breedingReadService.ts` + `/api/breeding/cycles|follicle-exams|overview` (owner-scoped);
account data export groups; `scripts/migrateLegacyPairingsToBreedingCycles.ts` (dry run default).

Docs: `docs/runbooks/breeding-cycles-migration.md`, user manual section "Breeding Cards"
(`docs/manuals/Breeding-Planner-User-Manual.md`), this tracker. i18n: 439 new keys in all ten
languages.

## Acceptance cases (Stage 12) → tests

| Case | Test |
|---|---|
| A | `cycleModel.test.js` "first actual pairing creates one female cycle"; backend `breedingCycleSync.test.ts` idempotent save + duplicate-active pause |
| B | `cycleModel.test.js` "another pairing and another male" |
| C, D, E | `cycleModel.test.js` "observed-lock counting rule" (March 1 + April 1 = 2; repeats, not-observed, unknown, corrections, differing dates, same-day sightings, duplicate flags) |
| F | `dates.test.js` (clamping, leap year), `followUps.test.js` (create, reuse, manual date kept, forward-only update, historical suppression, pause/closed/ovulation, skip/fulfil); backend reminder sync test |
| G | `cycleModel.test.js` "multiple sires toggle never deletes history" |
| H | `follicles.test.js` "pre-pairing scans" |
| I | `follicles.test.js` "follicle entry" |
| J | `follicles.test.js` 19→24 mm / 14 d = +5 mm, 0.357 mm/day; zero-day and incompatible refused |
| K | `cycleModel.test.js` clutch counts distinct; `follicles` post-ovulation off the curve |
| L | `cycleModel.test.js` milestones recorded vs suspected, later without earlier, conflicts flagged |
| M | `history.test.js` medians, ranges, sample counts, no-clutch, one prior, empty |
| N | `cycleModel.test.js` candidate sires and parentage |
| O | `cycleModel.test.js` partial hatch open, complete closes, no-clutch closure + reopen, retries |
| P | `legacyMigration.test.js` single/multi-male, multi-season, missing dates, aggregate locks, partial; rerun-safe with equal counts |
| Q | `breedingCycleSync.test.ts` cross-account references rejected, other owner sees nothing, 401 anonymous |
| R | Playwright `breeding-cards.spec.ts` (keyboard-reachable dialogs, chart→table, loading/empty/error states) + phone-width browser pass |

## Checks executed (2026-10-11, Windows 11, Node 24.11.1, Postgres local)

| Check | Result |
|---|---|
| `breeding-app-breeder`: `npx vitest run src/features/breeding` | 7 files, 59 tests passed |
| `breeding-app-breeder`: `npx vitest run` (whole app) | 52 files, 712 tests passed (final rerun) |
| `breeding-app-breeder`: `npm run lint` | passed (0 problems) |
| `breeding-app-breeder`: `npx vite build` | passed |
| `breeding-app-backend`: `npx tsc --noEmit` | passed |
| `breeding-app-backend`: `npx vitest run src/tests/breedingCycleSync.test.ts` | 10 passed |
| `breeding-app-backend`: `npx vitest run src/tests/breederDataService.test.ts` | 26 passed (mocks extended for the two new tables) |
| `breeding-app-backend`: full `npx vitest run` | 74 files, 732 tests passed (three existing test files had their hand-written Prisma mocks extended with the two new tables) |
| `prisma validate`, `prisma migrate deploy` on `breeding_planner_e2e` | applied; partial unique index present |
| `node scripts/check-app-locales.cjs` | passed: every source key in English, all ten languages complete (447 new keys) |
| Browser pass (Playwright script, dev server :5177, seeded localStorage) | full scenario steps 1–9 at 1360px and 390px; no horizontal overflow; no page errors |
| Playwright `tests/e2e/breeding-cards.spec.ts` against backend :4100 / `breeding_planner_e2e` (migration applied) | passed: all 10 scenario steps through the real app and sync (1.1 min) |

Not run: CI on GitHub (branch not pushed); Android/Electron builds (same web code, not rebuilt);
Google Calendar sync (requires a signed-in Google account); real email delivery (mock provider).

## Deferred by specification

Validated learned prediction models, automated ultrasound image interpretation or measurement,
population-wide follicle-to-ovulation modelling. Not started on purpose.

## Open items / owner decisions

- Merge `feature/breeding-cards` (PR against `main`), then deploy the migration with the normal
  `start:migrate` path. Run the dry-run reconciliation script per environment first.
- Whether to run `--apply` of the server-side legacy migration on staging/production, or let each
  device map its own records on first load (both are safe; the ids are identical).
- The legacy pairing views stay reachable ("Active/Completed pairings", Incubator, clutch cards);
  retiring them is a later decision once cards cover the incubator and clutch-card printing.
