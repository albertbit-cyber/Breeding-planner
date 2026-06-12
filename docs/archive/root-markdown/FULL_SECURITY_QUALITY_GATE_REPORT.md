# Full Security Quality Gate Report

## Passed
- Backend targeted security tests: 6 files, 43 tests.
- Backend full test suite: 14 files, 79 tests.
- Backend TypeScript build.
- Breeder tests: 8 files, 44 tests.
- Lab tests: 9 files, 56 tests.
- Admin tests: 2 files, 19 tests.
- Marketplace tests: 2 files, 19 tests.
- Shared tests: 5 files, 40 tests.
- Breeder, lab, admin, marketplace, shared, and root builds.

## Warnings Observed
- Vite circular chunk warnings in breeder/lab builds.
- pdfjs eval warning in breeder/root builds.
- Vitest websocket port reuse warnings in some package test runs.
- Lab PDF font fallback warning in label layout tests.

## Not Run
Full Playwright browser E2E was not run in this phase because live local backend/frontend servers were not started for this turn.

