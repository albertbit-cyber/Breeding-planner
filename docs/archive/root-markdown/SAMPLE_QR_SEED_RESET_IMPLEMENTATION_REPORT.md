# Sample QR Seed Reset Implementation Report

## Implemented

- Extended `breeding-app-lab/tests/e2e/order-test-helpers.ts`.
- Added `getFirstSyntheticSample`.
- Added local SHA-256 generation matching the Lab app's stable QR token logic.
- Cached API login token in `breeding-app-lab/tests/e2e/helpers.ts` to avoid local auth rate limiting across the full E2E suite.

## Verified

- Sample/QR specific Playwright spec passed.
- Full Lab Playwright E2E passed.

