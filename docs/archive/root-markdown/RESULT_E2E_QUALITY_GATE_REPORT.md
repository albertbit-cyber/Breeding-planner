# Result E2E Quality Gate Report

## Commands Run

- `breeding-app-backend`: `npm.cmd test -- orderRoutes.test.ts` passed.
- `breeding-app-backend`: `npm.cmd run build` passed.
- `breeding-app-backend`: `npm.cmd test` passed, 60 tests.
- `breeding-app-lab`: `npm.cmd test` passed, 56 tests.
- `breeding-app-lab`: `npm.cmd run build` passed.
- `breeding-app-lab`: `npm.cmd run test:e2e -- lab-result-entry.spec.ts` passed.
- `breeding-app-lab`: `npm.cmd run test:e2e` passed, 11 tests.

## Warnings

- Lab unit tests still warn that PDF font loading falls back in the test runtime.
- Lab build still warns about a circular vendor chunk.
- Playwright backend startup still shows Prisma `package.json#prisma` deprecation warning.

## Result

Safe to continue to the next workflow slice.

