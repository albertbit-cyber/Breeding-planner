# Certificate E2E Quality Gate Report

## Commands Run

- `breeding-app-backend`: `npm.cmd test` passed, 60 tests.
- `breeding-app-backend`: `npm.cmd run build` passed.
- `breeding-app-lab`: `npm.cmd test` passed, 56 tests.
- `breeding-app-lab`: `npm.cmd run build` passed.
- `breeding-app-lab`: `npm.cmd run test:e2e -- lab-certificate.spec.ts` passed.
- `breeding-app-lab`: `npm.cmd run test:e2e` passed, 13 tests.

## Warnings

- Lab unit tests still warn that PDF font loading falls back in test runtime.
- Lab build still warns about circular vendor chunks.
- Playwright backend startup still warns about Prisma `package.json#prisma` deprecation.

## Result

Certificate E2E is passing against local PostgreSQL and the shared backend.

