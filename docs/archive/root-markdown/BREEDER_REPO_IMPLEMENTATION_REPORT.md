# Breeder Repo Implementation Report

Date: 2026-05-16

## Scope

This report covers step 20, extracting the breeder-facing application into `breeding-app-breeder`.

## Completed

- Created the standalone breeder app folder: `breeding-app-breeder`.
- Added standalone project metadata:
  - `package.json`
  - `vite.config.mts`
  - `tsconfig.json`
  - `.env.example`
  - `README.md`
  - `.gitignore`
- Preserved the breeder/mobile application source surface, including:
  - main app shell and breeder planner UI
  - animal, pairing, clutch, incubator, hatchling, QR, label, and mobile-related code
  - Capacitor Android project files
  - shared UI support files copied from the combined app where still required
- Added local ignore rules for dependency, build, test, log, and environment artifacts.

## Verification

- `npm.cmd run build` from inside `breeding-app-breeder` passed after the split.
- Earlier test run from the split phase passed for the breeder app: 8 test files, 44 tests.

## Remaining Work

- Replace copied shared modules with imports from `breeding-app-shared` after the package is wired into the workspace or package registry.
- Replace remaining local browser/database-style storage paths with backend API calls after backend routes are finalized.
- Confirm mobile Android build separately from the web Vite build.
- Review staged generated artifacts before publishing. The Git index currently includes previously staged `build` and `node_modules` artifacts that should not be committed to a clean repository.

