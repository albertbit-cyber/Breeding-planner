# Order E2E Quality Gate Report

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

- Backend targeted tests passed: 24 tests.
- Backend TypeScript build passed.
- Lab unit tests passed: 56 tests.
- Lab production build passed.
- Lab Playwright E2E passed: 9 tests.

## Warnings

- Lab unit tests still log the existing PDF font fallback warning.
- Lab build still reports the existing circular chunk warning: `vendor -> vendor-react -> vendor`.
- Playwright backend startup still reports Prisma's `package.json#prisma` deprecation warning.

## Status

Safe to continue with the next narrow Lab workflow slice.
