# Initial CI Pipeline Implementation Report

Step: 237

## Implemented

- Added `.github/workflows/dependency-ci.yml`.

## Workflow Coverage

- Installs backend, shared, lab, and breeder dependencies with `npm ci`.
- Starts PostgreSQL 17 service.
- Runs Prisma generate, migrate deploy, and deterministic reset.
- Runs backend test/build.
- Runs shared test/build.
- Runs lab test/build.
- Runs breeder test/build.
- Runs lab deterministic E2E.
- Runs breeder deterministic E2E.
- Uploads Playwright reports and test results only on failure.

## Supporting Changes

- Lab and breeder Playwright webServer commands were changed from Windows-only `npm.cmd` to cross-platform `npm`.
- Reset scripts were changed to use `cross-env`.
