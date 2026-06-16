# Final Pre-Staging Quality Gate Report

Date: 2026-05-20

## Backend

- `npm.cmd test` in `breeding-app-backend`: passed.
- Result: 19 test files, 95 tests passed.
- `npm.cmd run build` in `breeding-app-backend`: passed.

## Frontend Builds

- `npm.cmd run build` in `breeding-app-lab`: passed.
- `npm.cmd run build` in `breeding-app-breeder`: passed.

## Live E2E

- `npm.cmd run test:e2e:live`: passed outside sandbox.
- Lab: 19/19 passed.
- Breeder: 9/9 passed.

## Warnings

- Prisma `package.json#prisma` deprecation warning remains.
- Vite circular chunk warning remains.
- Breeder build warns about `pdfjs-dist` using `eval`.
- Breeder app bundle remains large.

