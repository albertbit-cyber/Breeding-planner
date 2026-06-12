# Local Full System Test Report

Date: 2026-05-16

## Scope

This report covers step 27, testing the local full system after the split preparation.

## Build Results

Passed:

- `breeding-app-breeder`: `npm.cmd run build`
- `breeding-app-admin`: `npm.cmd run build`
- `breeding-app-lab`: `npm.cmd --prefix breeding-app-lab run build`
- `breeding-app-marketplace`: `npm.cmd --prefix breeding-app-marketplace run build`
- `breeding-app-shared`: `npm.cmd --prefix breeding-app-shared run build`

Failed:

- `breeding-app-backend`: `npm.cmd --prefix breeding-app-backend run build`

## Backend Build Blockers

- Local backend dependency install/generation is incomplete. Missing modules/types include Express, CORS, Helmet, Morgan, Prisma client, bcrypt, JWT, Zod, and test support packages.
- Prisma client needs to be generated after dependencies are installed.
- Several backend routes/services still use the legacy `lab` role while the new target role type uses `lab_owner` and `lab_staff`.

## Earlier Test Results From Split Phase

Passed:

- Breeder app: 8 test files, 44 tests.
- Admin app: 2 test files, 19 tests.
- Lab app: 9 test files, 56 tests.
- Marketplace app: 2 test files, 19 tests.

Partially failed:

- Backend tests: blocked by missing `supertest`, `@prisma/client`, and related backend dependencies.
- Shared package tests: some app/backend-specific test imports still need isolation after shared extraction.

## Full System Runtime

The full multi-app system was not started end-to-end because the backend cannot currently build or start cleanly without installing backend dependencies, generating Prisma, providing database environment variables, and resolving the role mismatch.

## Result

The extracted frontend apps and shared package are buildable. The backend is the current blocker for a complete local system run.

