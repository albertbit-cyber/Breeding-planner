# Final Local Runtime Validation Report

Date: 2026-05-20

## Result

Passed.

## Commands

- `npm.cmd test` in `breeding-app-backend`: passed, 19 files and 95 tests.
- `npm.cmd run build` in `breeding-app-backend`: passed.
- `npm.cmd run build` in `breeding-app-lab`: passed.
- `npm.cmd run build` in `breeding-app-breeder`: passed.
- `npm.cmd run test:e2e:live`: passed in elevated mode.

## Live E2E

- Lab: 19/19 passed.
- Breeder: 9/9 passed.

## Warnings

- Prisma `package.json#prisma` deprecation warning.
- Vite circular chunk warning.
- `pdfjs-dist` eval warning.
- Large breeder `App.jsx` warning.

