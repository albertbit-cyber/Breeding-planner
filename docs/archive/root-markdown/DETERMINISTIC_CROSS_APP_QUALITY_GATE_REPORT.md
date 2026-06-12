# Deterministic Cross-App Quality Gate Report

Step: 223

## Commands Run

- `npm.cmd run build` in `breeding-app-backend`: passed.
- `npm.cmd test` in `breeding-app-backend`: 12 files, 68 tests passed.
- `npm.cmd run build` in `breeding-app-lab`: passed.
- `npm.cmd run build` in `breeding-app-breeder`: passed.
- `npm.cmd run e2e:reset:local` in `breeding-app-backend`: passed.
- `npm.cmd run test:e2e:reset` in `breeding-app-lab`: 19 passed.
- `npm.cmd run test:e2e:reset` in `breeding-app-breeder`: 9 passed.

## Warnings

- Lab build reports a circular chunk warning.
- Breeder build reports `pdfjs-dist` eval warning.
- Breeder E2E web server reports stale `baseline-browser-mapping`.
- Breeder build reports `src/App.jsx` exceeds Babel generator optimization size.
