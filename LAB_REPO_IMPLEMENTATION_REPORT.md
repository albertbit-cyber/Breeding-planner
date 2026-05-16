# Lab Repo Implementation Report

Date: 2026-05-16

## Scope

This report covers step 22, extracting the lab-facing application into `breeding-app-lab`.

## Completed

- Created the standalone lab app folder: `breeding-app-lab`.
- Added standalone project metadata:
  - `package.json`
  - `vite.config.mts`
  - `tsconfig.json`
  - `.env.example`
  - `README.md`
  - `.gitignore`
- Preserved the lab source surface, including:
  - lab dashboard, incoming orders, sample intake, completed tests, result entry, pricing, and catalog pages
  - lab order, certificate, label, QR, pricing, and workflow services
  - lab-specific tests and type definitions
  - shared backend/auth shell components copied from the combined app where still required
- Added local ignore rules for dependency, build, test, log, and environment artifacts.

## Verification

- `npm.cmd --prefix breeding-app-lab run build` passed after the split.
- Earlier test run from the split phase passed for the lab app: 9 test files, 56 tests.

## Remaining Work

- Replace copied lab/shared types and services with imports from `breeding-app-shared`.
- Replace remaining local lab store/cache access with backend endpoints. The audit found local database-style helpers in:
  - `breeding-app-lab/src/db/labStore.ts`
  - `breeding-app-lab/src/db/cache.ts`
- Confirm lab certificate, QR lookup, sample workflow, and result-finalization contracts against backend routes.
- Review staged generated artifacts before publishing.

