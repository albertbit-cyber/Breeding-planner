# ChatGPT Deterministic E2E Handoff

Step: 229

## Summary

The deterministic E2E infrastructure stage, steps 212-229, has been completed locally. A backend-owned reset script now recreates local test users and the stable lab order used by the Lab and Breeder Playwright suites. Both suites now have reset-aware commands and passed against local PostgreSQL.

## Implemented Files

- `breeding-app-backend/prisma/e2eReset.ts`
- `e2e/fixtures/deterministicFixtures.mjs`
- `breeding-app-backend/package.json`
- `breeding-app-lab/package.json`
- `breeding-app-breeder/package.json`
- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-breeder/tests/e2e/helpers.js`

## Reset Contract

Run from backend:

```powershell
npm.cmd run e2e:reset:local
```

Run reset plus Lab E2E:

```powershell
cd breeding-app-lab
npm.cmd run test:e2e:reset
```

Run reset plus Breeder E2E:

```powershell
cd breeding-app-breeder
npm.cmd run test:e2e:reset
```

The reset requires local PostgreSQL and refuses non-local or production-looking `DATABASE_URL` values. It does not print secrets.

## Verification Completed

- Backend build passed.
- Backend unit/API tests passed: 68 tests.
- Lab build passed.
- Breeder build passed.
- Backend deterministic reset passed against `breeding_planner_local`.
- Lab reset E2E passed: 19 tests.
- Breeder reset E2E passed: 9 tests.

## Known Warnings

- Lab build has a circular chunk warning.
- Breeder build has `pdfjs-dist` eval warning.
- Breeder build has very large `src/App.jsx`.
- Breeder E2E server logs stale `baseline-browser-mapping`.

## Dependency Audit State

- Backend audit failed with 9 vulnerabilities.
- Lab audit failed with 6 vulnerabilities.
- Breeder audit could not run due missing lockfile.

## Remaining Work Recommended

1. Plan dependency upgrades and lockfile policy.
2. Decide whether to make root `e2e/fixtures/deterministicFixtures.mjs` the single imported source for both Prisma reset and Playwright helpers.
3. Replace remaining timestamp-generated test codes with deterministic IDs.
4. Add CI workflow after dependency/lockfile strategy is settled.
5. Keep deployment work separate until CI and staging database policy are approved.
