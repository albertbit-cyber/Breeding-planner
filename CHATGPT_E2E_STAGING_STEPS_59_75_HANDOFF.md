# ChatGPT E2E/Staging Steps 59-75 Handoff

Date: 2026-05-17
Repository: `D:\Git Clone\Breeding-planner`
Branch: `all-branches-merged`

## Purpose

This report summarizes the work completed for steps 59-75, what was blocked, what was verified, and what ChatGPT/JudgeBT should plan next.

## High-Level Result

The safe planning and backend-contract portions of steps 59-75 were completed. True database-backed E2E runtime steps were blocked because no confirmed local/staging `DATABASE_URL` exists yet.

No push, deployment, production migration, or destructive cleanup was performed.

## Agent Usage

An agent was used for read-only branch/env/database planning. A second agent could not be started due thread limits, so the remaining analysis and implementation were completed locally.

## Files Created

Step reports created:

- `PUSH_AND_BRANCH_STRATEGY_DECISION.md`
- `LOCAL_OR_STAGING_DATABASE_SETUP_CHECKLIST.md`
- `LOCAL_E2E_ENVIRONMENT_PREPARATION.md`
- `LOCAL_PRISMA_MIGRATION_AND_SEED_REPORT.md`
- `BACKEND_E2E_RUNTIME_START_REPORT.md`
- `FIRST_FRONTEND_E2E_START_REPORT.md`
- `LOGIN_AND_AUTH_RUNTIME_VERIFICATION_REPORT.md`
- `LAB_CATALOG_PRICING_E2E_VERIFICATION_REPORT.md`
- `LAB_CATALOG_PRICING_FALLBACK_REMOVAL_REPORT.md`
- `NEXT_BACKEND_ROUTE_FAMILY_PLAN.md`
- `LAB_ORDER_BACKEND_CONTRACTS_IMPLEMENTATION_REPORT.md`
- `LAB_ORDER_FRONTEND_API_MIGRATION_REPORT.md`
- `SHARED_PACKAGE_DEPENDENCY_STRATEGY.md`
- `SHARED_API_CONFIG_BACKEND_STATUS_CLEANUP_REPORT.md`
- `MARKETPLACE_PUBLIC_SAFE_DTO_PLAN.md`
- `TOKEN_STORAGE_MITIGATION_PLAN.md`
- `STAGING_DEPLOYMENT_DRY_RUN_PLAN.md`

Final handoff:

- `CHATGPT_E2E_STAGING_STEPS_59_75_HANDOFF.md`

## Code Added

Added backend route contract tests:

- `breeding-app-backend/src/tests/orderRoutes.test.ts`

Purpose:

- Cover the next backend route family: lab order list/detail/status/payment.

Test coverage added:

- breeder can list orders
- legacy persisted `lab` token normalizes to `lab_staff`
- buyer is forbidden from lab order reads
- invalid status update is rejected
- lab staff can update status
- missing payment status is rejected

## Step Status

### Step 59 - Push and Branch Strategy Decision

Completed as report.

Result:

- Recommended keeping `all-branches-merged` as integration branch.
- Do not push without explicit approval.
- Do not split into separate repos until E2E/staging passes.

### Step 60 - Local or Staging Database Setup Checklist

Completed as report.

Finding:

- `breeding-app-backend` has `.env.example` only.
- No confirmed local/staging `DATABASE_URL` exists.

### Step 61 - Prepare Local E2E Environment Files

Completed as report.

Result:

- Documented backend `.env` and frontend `VITE_API_URL` setup.
- No real `.env` files were created or committed.

### Step 62 - Run Prisma Local Migration and Seed

Blocked.

Reason:

- No confirmed local/staging `DATABASE_URL`.

No migrations or seed commands were run.

### Step 63 - Start Backend for E2E

Blocked.

Reason:

- Step 62 blocked; backend was not started against a real database.

### Step 64 - Start First Frontend for E2E

Blocked.

Reason:

- Backend runtime was not available.

### Step 65 - Verify Login and Auth Runtime

Blocked for browser/runtime E2E.

Automated backend auth tests remain passing.

### Step 66 - Verify Lab Catalog/Pricing E2E

Blocked for browser/runtime E2E.

Automated backend catalog/pricing route tests already exist and pass.

### Step 67 - Remove Lab Catalog/Pricing Fallback If Safe

Not performed.

Reason:

- E2E verification did not run, so fallback removal is not safe yet.

### Step 68 - Plan Next Backend Route Family

Completed.

Chosen route family:

- lab order list/detail/status/payment

### Step 69 - Implement Lab Order Backend Contracts

Completed as backend route contract tests.

Added:

- `breeding-app-backend/src/tests/orderRoutes.test.ts`

### Step 70 - Migrate Lab Order Frontend Flow

Not performed.

Reason:

- frontend migration should wait for database-backed E2E runtime and seeded/test order data.

Recommended first frontend flow:

- lab order list view

### Step 71 - Shared Package Dependency Strategy

Completed as report.

Recommendation:

- keep local copies until E2E is proven
- then use workspace or `file:` dependency while apps remain together
- publish private package only if split apps become separate repositories

### Step 72 - Shared API Config Backend Status Cleanup

Not performed.

Reason:

- dependency strategy should be finalized first.

Recommended first target:

- `breeding-app-admin`
- API config/backend status helpers

### Step 73 - Marketplace Public Safe DTO Plan

Completed as report.

Main point:

- Do not make marketplace browsing public until a safe DTO hides internal IDs and private contact fields.

### Step 74 - Token Storage Mitigation Plan

Completed as report.

Decision:

- keep `localStorage` short-term for staging with CSP/XSS discipline
- plan httpOnly cookie + CSRF migration later

### Step 75 - Staging Deployment Dry Run Plan

Completed as report.

Result:

- staging DB/backend/frontend dry-run order documented
- production deployment explicitly not performed

## Verification Performed

### Backend

Commands:

```powershell
npm.cmd --prefix breeding-app-backend run build
npm.cmd --prefix breeding-app-backend test
```

Result:

- build passed
- 11 test files passed
- 54 tests passed

### Shared Package

Commands:

```powershell
npm.cmd --prefix breeding-app-shared run build
npm.cmd --prefix breeding-app-shared test
```

Result:

- build passed
- 5 test files passed
- 40 tests passed

### Admin

Result:

- build passed
- 2 test files passed
- 19 tests passed

### Marketplace

Result:

- build passed
- 2 test files passed
- 19 tests passed

### Lab

Result:

- build passed
- 9 test files passed
- 56 tests passed

Known warning:

- PDF font fallback warning in Node test environment.

### Breeder

Result:

- build passed
- 8 test files passed
- 44 tests passed

Known warning:

- `pdfjs-dist` eval warning during build.

## Current Main Blocker

The next real progress blocker is database/runtime setup.

Need:

- create `breeding-app-backend/.env`
- confirm `DATABASE_URL` points to local or staging, not production
- run Prisma migration/seed against that confirmed database
- start backend
- start first frontend
- verify login and lab catalog/pricing E2E

## Recommended Next Task

Next best task:

```text
Configure a safe local or staging PostgreSQL DATABASE_URL, then run steps 62-66.
```

If the user does not have a database ready:

```text
Set up a local PostgreSQL database and create a non-production backend .env file.
```

## Do Not Do Without Approval

- Do not push.
- Do not deploy.
- Do not run production migrations.
- Do not create or commit real `.env` files.
- Do not delete legacy source folders.
- Do not remove lab catalog/pricing fallback until E2E passes.
- Do not migrate lab order frontend flow until backend runtime and seeded data are verified.
- Do not make marketplace browsing public before safe DTO implementation.
- Do not change token storage without a dedicated migration plan.

