# Sample QR E2E Quality Gate Report

## Commands Run

- `breeding-app-backend`: `npm.cmd test` passed, 60 tests.
- `breeding-app-backend`: `npm.cmd run build` passed.
- `breeding-app-lab`: `npm.cmd test` passed, 56 tests.
- `breeding-app-lab`: `npm.cmd run build` passed.
- `breeding-app-lab`: `npm.cmd run test:e2e -- lab-sample-qr.spec.ts` passed.
- `breeding-app-lab`: `npm.cmd run test:e2e` passed, 16 tests.

## Warnings

- Lab unit tests still warn about PDF font fallback in test runtime.
- Lab build still warns about circular vendor chunks.
- Playwright backend startup still warns about Prisma `package.json#prisma` deprecation.

## Result

Sample/QR E2E is passing against local PostgreSQL and shared backend order APIs.

