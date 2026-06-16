# Certificate View Playwright E2E Implementation Report

## Implemented

- Added `breeding-app-lab/tests/e2e/lab-certificate.spec.ts`.
- Added a view test for completed seeded order certificate behavior.
- The test captures `window.open` and asserts that the certificate view action generates a blob URL.

## Verified

- `npm.cmd run test:e2e -- lab-certificate.spec.ts` passed.
- Full Lab Playwright E2E passed with 13 tests.

