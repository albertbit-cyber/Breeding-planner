# Local Quality Gate With E2E

Date: 2026-05-17

## Commands Run

Backend:

```powershell
npm.cmd test -- labRoutes.test.ts auth.test.ts orderRoutes.test.ts
npm.cmd run build
```

Lab:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

## Results

- Backend targeted tests: passed, 24 tests.
- Backend TypeScript build: passed.
- Lab unit tests: passed, 56 tests across 9 files.
- Lab production build: passed.
- Lab Playwright E2E: passed, 6 tests.

## Fix Applied During Gate

Vitest originally tried to load Playwright tests because `tests/e2e` was not excluded. `breeding-app-lab/vite.config.mts` now excludes `tests/e2e/**` from Vitest.

## Remaining Warnings

- Lab unit tests still log an existing PDF font fallback warning for `/src/assets/fonts/NotoSans-Regular.ttf` in Node/Vitest.
- Lab build still reports a circular chunk warning involving `vendor` and `vendor-react`.
- Backend startup still reports Prisma's `package.json#prisma` deprecation warning.
- `npm install` reported dependency audit findings that need a separate dependency review.
