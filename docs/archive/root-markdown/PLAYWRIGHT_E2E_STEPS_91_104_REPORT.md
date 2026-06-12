# Playwright E2E Steps 91-104 Report

Date: 2026-05-17

## Completed

- Added Playwright to `breeding-app-lab`.
- Added Playwright config with backend and Lab frontend web servers.
- Added ignored local E2E environment template.
- Added authenticated setup project and browser tests for health, login, Lab shell, catalog/pricing, and order list.
- Added E2E scripts to the Lab package.
- Ignored Playwright auth state, reports, traces, screenshots, and local E2E env files.
- Fixed Vitest so unit tests do not load Playwright specs.
- Ran backend tests/build, Lab tests/build, and Lab Playwright E2E.

## Verification

- `breeding-app-backend`: targeted tests passed, 24 tests.
- `breeding-app-backend`: TypeScript build passed.
- `breeding-app-lab`: unit tests passed, 56 tests.
- `breeding-app-lab`: production build passed.
- `breeding-app-lab`: Playwright E2E passed, 6 tests.

## Files Added

- `breeding-app-lab/.env.e2e.example`
- `breeding-app-lab/playwright.config.ts`
- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-lab/tests/e2e/auth.setup.ts`
- `breeding-app-lab/tests/e2e/backend-health.spec.ts`
- `breeding-app-lab/tests/e2e/lab-frontend.spec.ts`
- `breeding-app-lab/tests/e2e/seeded-login.spec.ts`
- `breeding-app-lab/tests/e2e/catalog-pricing-network.spec.ts`
- `breeding-app-lab/tests/e2e/lab-order-list.spec.ts`

## Files Changed

- `.gitignore`
- `breeding-app-lab/package.json`
- `breeding-app-lab/package-lock.json`
- `breeding-app-lab/vite.config.mts`

## Remaining Work

- Review dependency audit findings.
- Address the existing Lab PDF font fallback warning in Vitest.
- Review the Lab build circular chunk warning.
- Move the next Lab workflow to backend-first E2E: order detail/status/payment.
- Prepare staging database, environment variables, CORS origins, secret handling, and migration deployment.
