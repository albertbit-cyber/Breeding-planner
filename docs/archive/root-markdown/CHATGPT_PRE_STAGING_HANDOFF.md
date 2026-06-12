# ChatGPT Pre Staging Handoff

## Summary
Steps 292-328 moved the app from cookie-preferred auth planning into database-backed security foundations and local pre-staging validation.

## Implemented In Steps 292-308
- Frontend API clients include cookies, track cookie-preferred auth mode, store CSRF tokens, refresh via cookie or JSON token, and retry with Bearer fallback.
- Playwright auth setup captures login cookies and marks storage state as cookie-preferred.
- Backend login/refresh include `csrfToken` in JSON response and set auth/CSRF cookies.
- Refresh tokens are stored hashed in the existing `User.refreshToken` column.
- Added security event service foundation with sanitized metadata and best-effort persistence.
- Added production-only marketplace mutation/message/QR/upload limiters and wired mutation/message routes.

## Implemented In Steps 309-328
- Added Prisma models and local SQL migration for:
  - `RefreshSession`
  - `SecurityEvent`
  - `MarketplaceMedia`
  - `MarketplaceMessageReport`
  - `MarketplaceUserBlock`
- Refactored auth runtime to create, rotate, and revoke refresh sessions when the table is available, while keeping existing hashed `User.refreshToken` fallback.
- Refactored security-event service to persist to `SecurityEvent`.
- Added upload storage abstraction and upload validation/scanning foundation.
- Added root live E2E runner:
  - `scripts/run-live-e2e.ps1`
  - `npm run test:e2e:live`
  - `npm run test:e2e:live:no-reset`
- Created reports for steps 309-328.

## Local Database
- Local Prisma migration deploy succeeded against:
  - Database: `breeding_planner_local`
  - Host: `localhost:5432`
- `npm.cmd run e2e:reset:local` passed after migration.
- No production database was used.

## Validation Passed
- `npm.cmd run prisma:generate`
- Backend targeted security tests passed.
- Full backend tests passed: 17 files, 85 tests.
- Backend build passed.
- Local migration deploy passed.
- Local E2E reset passed.

## E2E Status
Live E2E is not clean yet.

Attempted:
- `npm.cmd run test:e2e:live:no-reset`

Result:
- Timed out after 10 minutes.
- Lab E2E partially ran.
- Several lab browser specs were failing/retrying around certificate, result entry, and sample QR workflows.
- Breeder E2E did not start before timeout.

## Current Blockers Before Staging
- Full live browser E2E must be made clean or failures must be triaged.
- Upload HTTP routes are not implemented yet.
- Marketplace moderation/report/block routes are not implemented yet.
- Staging env templates/topology are planned but not deployed.
- Existing unrelated dirty worktree remains broad and should be reviewed before branch publication.

## Recommended Next Step
Run lab E2E separately with a longer timeout, inspect the Playwright traces for the failing certificate/result/sample QR specs, fix those browser/runtime issues, then rerun the full live E2E gate before staging.
