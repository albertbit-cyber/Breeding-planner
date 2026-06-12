# Local Pre-Staging Gate Report

Date: 2026-05-20

## Results

Passed with one resource-contended retry.

## Commands

- `npm.cmd test` in `breeding-app-backend`: initially failed while run in parallel with builds due to Vitest worker OOM; passed when rerun alone.
- `npm.cmd run build` in `breeding-app-backend`: passed.
- `npm.cmd run build` in `breeding-app-lab`: passed.
- `npm.cmd run build` in `breeding-app-breeder`: passed.
- `npm.cmd run test:e2e:live`: passed in elevated execution mode.

## Final Passing Counts

- Backend tests: 19 files, 95 tests.
- Lab live E2E: 19/19.
- Breeder live E2E: 9/9.

## Warnings

- Prisma `package.json#prisma` deprecation warning.
- Vite circular chunk warning.
- `pdfjs-dist` eval warning.
- Large breeder `App.jsx` warning.

