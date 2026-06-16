# ChatGPT Handoff: Playwright E2E Steps 91-104

Date: 2026-05-17

## Repository State

Repository: `d:\Git Clone\Breeding-planner`

Current branch during this work: `all-branches-merged`

This stage added local browser E2E coverage for the Lab app against the real local backend and local PostgreSQL database prepared in the previous database E2E stage.

## What Was Done

Playwright was added to `breeding-app-lab` and configured to:

- Start or reuse the backend at `http://127.0.0.1:4000`.
- Start or reuse the Lab frontend at `http://127.0.0.1:4173`.
- Run tests with one worker to avoid local login rate-limit noise.
- Create ignored authenticated browser state for Lab tests.
- Keep one UI-login test that starts from empty browser storage.

## Main Files Added

- `breeding-app-lab/.env.e2e.example`
- `breeding-app-lab/playwright.config.ts`
- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-lab/tests/e2e/auth.setup.ts`
- `breeding-app-lab/tests/e2e/backend-health.spec.ts`
- `breeding-app-lab/tests/e2e/lab-frontend.spec.ts`
- `breeding-app-lab/tests/e2e/seeded-login.spec.ts`
- `breeding-app-lab/tests/e2e/catalog-pricing-network.spec.ts`
- `breeding-app-lab/tests/e2e/lab-order-list.spec.ts`

## Main Files Changed

- `.gitignore`
- `breeding-app-lab/package.json`
- `breeding-app-lab/package-lock.json`
- `breeding-app-lab/vite.config.mts`

## E2E Coverage Now Passing

- Backend health endpoint.
- Authenticated Lab frontend shell.
- Seeded lab user UI login.
- Test catalog screen backend call.
- Pricing endpoint backend reachability.
- Seeded Lab order list showing order `05AA00001`.

## Verification Completed

Backend:

- `npm.cmd test -- labRoutes.test.ts auth.test.ts orderRoutes.test.ts`
- `npm.cmd run build`

Lab:

- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run test:e2e`

Latest results:

- Backend targeted tests passed: 24 tests.
- Backend TypeScript build passed.
- Lab unit tests passed: 56 tests across 9 files.
- Lab production build passed.
- Lab Playwright E2E passed: 6 tests.

## Important Security Notes

- Real E2E credentials were not committed.
- `breeding-app-lab/.env.e2e.example` contains placeholders only.
- `breeding-app-lab/playwright/.auth` is ignored because it contains generated auth state.
- `breeding-app-lab/playwright-report` and `breeding-app-lab/test-results` are ignored.
- Backend `.env` remains local-only and ignored.

## Warnings Still Present

- `npm install` reported dependency audit findings: 5 moderate and 1 critical.
- Lab unit tests log an existing PDF font fallback warning in Node/Vitest.
- Lab production build reports an existing circular chunk warning involving `vendor` and `vendor-react`.
- Backend startup reports Prisma's `package.json#prisma` deprecation warning.
- Git prints a global ignore permission warning for `C:\Users\alber\.config\git\ignore`; this did not block work.

## Local Fallback Review

Do not remove `db/labStore` yet. The new E2E suite proves backend-backed auth, catalog/pricing, and order list behavior, but other workflows still depend on local/fallback code:

- Result entry
- Result finalization
- Certificate generation
- Sample lookup
- Shed terminal
- Shipment labels
- Admin oversight
- Genetics update logging
- Some breeder-facing Lab flows

UI preferences, auth session, appearance settings, i18n settings, and cart-style state also still intentionally use `localStorage`.

## Recommended Next Step

The next safest API migration slice is Lab order detail/status/payment.

Suggested next prompt:

```text
Continue from CHATGPT_PLAYWRIGHT_E2E_91_104_HANDOFF.md. Add backend-backed browser E2E coverage for the Lab order detail/status/payment workflow using the seeded order 05AA00001. Do not remove broad local fallback modules yet. After the test passes, identify the smallest obsolete fallback path that can be removed safely, then run the local quality gate.
```

## Staging Readiness

The app is not ready for staging deployment yet. Before staging:

- Provision staging PostgreSQL.
- Configure staging backend env vars and secrets outside git.
- Configure staging frontend API URL.
- Configure backend CORS origins for staging.
- Run Prisma migrations against staging.
- Decide how staging seed/test users will be created and rotated.
- Review dependency audit findings.
- Keep the local E2E gate as the pre-staging quality gate.
