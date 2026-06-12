# ChatGPT Handoff: Breeder Playwright Runtime Stage 191-211

## Current App State

This stage continued after the breeder/lab workflow work and implemented a dedicated breeder Playwright runtime suite. The app is split into backend, breeder, lab, and shared packages. Local PostgreSQL and the shared backend are used for runtime E2E checks.

## What Was Implemented

- Added a dedicated breeder Playwright config at `breeding-app-breeder/playwright.config.mjs`.
- Added breeder E2E scripts to `breeding-app-breeder/package.json`:
  - `test:e2e`
  - `test:e2e:ui`
- Reused the already-installed Lab Playwright package because installing a new breeder-local Playwright dependency failed due the unresolved `@capacitor/preferences@^8.1.0` package.
- Added breeder E2E helpers and setup auth state under `breeding-app-breeder/tests/e2e`.
- Added breeder E2E coverage for:
  - backend health
  - frontend load
  - seeded browser login
  - order creation from the snake editor
  - order visibility in the snake testing panel
  - breeder label preview/download
  - breeder certificate download for completed owned orders
- Updated `.gitignore` for breeder E2E auth state, reports, and test-results.
- Updated breeder Vitest config to exclude `tests/e2e/**` so Playwright specs are not collected by unit tests.

## Runtime Fixes Made While Implementing E2E

- `breeding-app-breeder/src/shared/config/api.ts`
  - Recognizes port `4174` as a dev browser session so the dedicated breeder runner can resolve the local backend fallback.
- `breeding-app-breeder/src/features/lab/api/client.ts`
  - Reads auth session from breeder, lab, admin, or legacy storage keys instead of only the lab key.
  - Includes animal names in legacy order mapping and matches breeder snake-panel orders by ID or animal name.
- `breeding-app-breeder/src/features/lab/components/BreederShedTestingPanel.jsx`
  - Passes the visible snake name into the order filter.
- `breeding-app-breeder/src/features/lab/components/BreederOrderGeneticTestModal.jsx`
  - Portals the genetic-test modal to `document.body`.
  - Raises its z-index so it floats above the snake edit card.
- `breeding-app-breeder/src/features/lab/components/BatchOrderCart.jsx`
  - Portals the batch cart to `document.body`.
  - Raises its z-index so the batch cart can be used while a snake edit card is open.
- `breeding-app-backend/src/routes/authRoutes.ts`
  - Auth rate limiting now applies only in production. Local dev/test runs no longer lock out Playwright after repeated seeded logins.

## Verification Results

Passed:

- `breeding-app-breeder`: `npm.cmd run test:e2e`
  - 9 passed
- `breeding-app-breeder`: `npm.cmd test`
  - 44 passed
- `breeding-app-breeder`: `npm.cmd run build`
  - passed
- `breeding-app-backend`: `npm.cmd test`
  - 68 passed
- `breeding-app-backend`: `npm.cmd run build`
  - passed

Known warnings during verification:

- Vite/Babel warns that `breeding-app-breeder/src/App.jsx` is over 500 KB.
- `baseline-browser-mapping` reports stale browser data.
- `pdfjs-dist` build warns about eval usage.

## Important Dependency Note

Attempting to install `@playwright/test` in `breeding-app-breeder` failed because npm could not resolve `@capacitor/preferences@^8.1.0`. The breeder E2E runner currently calls the Lab app's local Playwright CLI/package:

```text
node ../breeding-app-lab/node_modules/@playwright/test/cli.js test
```

This is functional for local validation but should be cleaned up later by fixing the breeder dependency graph or pinning valid Capacitor package versions.

## What Still Needs Attention

- Decide whether to keep auth rate limiting disabled for all non-production backend runs. This is useful for local E2E, but should be documented as intentional.
- Fix the breeder package dependency issue around `@capacitor/preferences@^8.1.0` so Playwright can be installed locally in `breeding-app-breeder`.
- Consider adding a reset/seed endpoint or test fixture cleanup for breeder E2E orders; repeated runs currently create many local lab orders.
- Continue reducing the very large `src/App.jsx` because build/test output shows it is still a major bundle and transform concern.
- Run the broader cross-app quality gate again before deployment if this stage is combined with other uncommitted work.

## Recommended Next Steps

1. Add a proper breeder-local Playwright dependency once the Capacitor version issue is resolved.
2. Add deterministic E2E cleanup/reset support for lab orders created during breeder tests.
3. Review all floating-window/modal z-index patterns and standardize them into a shared overlay primitive.
4. Run a full cross-app gate: backend, breeder, lab, and shared unit tests/builds plus Lab and Breeder E2E.
5. Prepare a commit after reviewing the large dirty tree, because many unrelated previous-stage files are still modified or untracked.
