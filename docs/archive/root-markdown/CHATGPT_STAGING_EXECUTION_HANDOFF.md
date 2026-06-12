# ChatGPT Staging Execution Handoff

Date: 2026-05-20

## Current Position

Steps 348-366 were completed after the previous staging readiness handoff.

## Main Outcome

The full root cross-app live E2E command now passes in the authoritative elevated local execution mode:

`npm.cmd run test:e2e:live`

## What Changed

- Hardened `scripts/run-live-e2e.ps1`.
- Added phase start/end logging.
- Added per-phase timeout supervision.
- Added cleanup for E2E listener ports.
- Added deterministic reset before breeder suite.
- Switched app E2E phases to direct Playwright CLI invocation.
- Added backend route-level integration tests for marketplace upload/report/block routes.

## Validation Completed

- Backend full tests: 19 files, 95 tests passed.
- Backend build: passed.
- Lab build: passed.
- Breeder build: passed.
- Full live E2E: passed outside sandbox.
- Lab live E2E in root runner: 19/19 passed.
- Breeder live E2E in root runner: 9/9 passed.

## Remaining Warnings

- Root live E2E may still behave incorrectly under sandboxed process supervision. Elevated local execution is the validated mode.
- Prisma `package.json#prisma` deprecation warning remains.
- Vite circular chunk warnings remain.
- Breeder build warns that `pdfjs-dist` uses `eval`.
- Bundle size remains large, especially breeder app.
- Worktree is heavily dirty and needs commit review.

## Recommended Next Plan

1. Review dirty git state and decide commit grouping.
2. Commit runtime code and tests separately from report artifacts if possible.
3. Prepare staging environment variables using placeholders in `STAGING_ENV_VARIABLE_TEMPLATE_REPORT.md`.
4. Run the live E2E command one more time immediately before staging deployment.
5. Deploy staging backend against a staging PostgreSQL database only.
6. Deploy lab and breeder frontends with explicit staging API URLs.
7. Run staging smoke tests and then staging live E2E.

