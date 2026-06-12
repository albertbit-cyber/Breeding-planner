# Breeder Lab Quality Gate Report

## Passed

- Backend targeted: `npm.cmd test -- orderRoutes.test.ts orderServiceVisibility.test.ts` - 20 passed.
- Backend full: `npm.cmd test` - 68 passed.
- Backend build: `npm.cmd run build` - passed.
- Lab unit: `npm.cmd test` - 56 passed.
- Lab build: `npm.cmd run build` - passed.
- Lab E2E targeted: `npm.cmd run test:e2e -- breeder-lab-workflow.spec.ts` - 4 passed.
- Lab E2E full: `npm.cmd run test:e2e` - 19 passed.
- Breeder unit: `npm.cmd test` - 44 passed.
- Breeder build: `npm.cmd run build` - passed.
- Breeder unit/build after duplicate component cleanup: 44 passed and build passed.
- Shared unit: `breeding-app-shared npm.cmd test` - 40 passed.
- Shared build: `breeding-app-shared npm.cmd run build` - passed.

## Warnings

- Lab unit tests still warn that PDF font loading falls back in Vitest due `/src/assets/fonts/...` URL parsing.
- Lab build still reports a circular vendor chunk.
- Breeder build warns about `pdfjs-dist` eval usage.
- Playwright backend server reports Prisma `package.json#prisma` deprecation warning.

## Not Applicable / Blocked

- `packages/shared` does not contain a package.json; real shared package used here is `breeding-app-shared`.
