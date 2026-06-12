# JudgeBT Next Step Handoff Report

Date: 2026-05-16
Repository: `D:\Git Clone\Breeding-planner`
Current branch: `all-branches-merged`

## Purpose

This report is a compact handoff for JudgeBT or ChatGPT so it can understand what has already been done in the repository split work and generate the next implementation plan without needing the full chat history.

## Current Goal

The original combined Breeding Planner application is being split into separate repositories/apps:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

The split is not fully complete. The frontend apps and shared package are mostly buildable, but the backend and final cleanup/publication work still need attention.

## What Has Been Done

### Branch And Planning Work

- Merged branches into the working branch `all-branches-merged`.
- Created a backup branch/report earlier in the process.
- Read and executed the planning files from the split plan series.
- Created planning/audit reports for the architecture and repository split.

Important existing reports:

- `CODEBASE_SPLIT_AUDIT.md`
- `TARGET_ARCHITECTURE.md`
- `BACKUP_BRANCH_REPORT.md`
- `SHARED_LOGIC_EXTRACTION_PLAN.md`
- `BACKEND_API_PLAN.md`
- `SHARED_DATABASE_SCHEMA_PLAN.md`
- `BREEDER_REPO_EXTRACTION_PLAN.md`
- `ADMIN_REPO_EXTRACTION_PLAN.md`
- `LAB_REPO_EXTRACTION_PLAN.md`
- `MARKETPLACE_REPO_EXTRACTION_PLAN.md`
- `SHARED_PACKAGE_PLAN.md`
- `ENVIRONMENT_CONFIGURATION_PLAN.md`
- `AUTH_AND_PERMISSIONS_PLAN.md`
- `PLANNING_PHASE_REPORT.md`

### Split Repo Folders Created

The following folders now exist:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

Each split folder has standalone project files such as:

- `package.json`
- `README.md`
- `.env.example`
- `.gitignore`
- app/build config files where relevant

### Shared Package Work

`breeding-app-shared` now contains shared foundations and exports for:

- genetics helpers
- auth roles and permissions
- API response helpers
- marketplace listing types
- pairing types
- lab types/status/pricing
- label presets
- backend status helpers
- API config
- quick-add parser

Relevant files include:

- `breeding-app-shared/src/index.ts`
- `breeding-app-shared/src/auth/roles.ts`
- `breeding-app-shared/src/auth/permissions.ts`
- `breeding-app-shared/src/api/response.ts`
- `breeding-app-shared/src/marketplace/listingTypes.ts`

### Backend Foundation Work

`breeding-app-backend` has backend foundation work for:

- app setup
- system routes
- auth foundation routes
- database helper
- auth identity/middleware
- role middleware
- auth service foundation

Relevant files include:

- `breeding-app-backend/src/app.ts`
- `breeding-app-backend/src/routes/systemRoutes.ts`
- `breeding-app-backend/src/routes/authFoundationRoutes.ts`
- `breeding-app-backend/src/modules/moduleRegistry.ts`
- `breeding-app-backend/src/lib/database.ts`
- `breeding-app-backend/src/types/auth.ts`
- `breeding-app-backend/src/auth/identity.ts`
- `breeding-app-backend/src/middleware/auth.ts`
- `breeding-app-backend/src/middleware/roles.ts`
- `breeding-app-backend/src/services/authService.ts`

### Steps 16-31 Reports Created

The stage 16-31 work has been summarized in:

- `NEXT_IMPLEMENTATION_STEPS_REPORT.md`
- `SHARED_PACKAGE_IMPLEMENTATION_REPORT.md`
- `BACKEND_REPO_IMPLEMENTATION_REPORT.md`
- `DATABASE_CONNECTION_IMPLEMENTATION_REPORT.md`
- `AUTH_BACKEND_IMPLEMENTATION_REPORT.md`
- `BREEDER_REPO_IMPLEMENTATION_REPORT.md`
- `ADMIN_REPO_IMPLEMENTATION_REPORT.md`
- `LAB_REPO_IMPLEMENTATION_REPORT.md`
- `MARKETPLACE_REPO_IMPLEMENTATION_REPORT.md`
- `DIRECT_DATABASE_CALLS_AUDIT.md`
- `DIRECT_DATABASE_CALLS_REPLACEMENT_REPORT.md`
- `MISSING_BACKEND_ENDPOINTS.md`
- `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`
- `SHARED_TYPES_SYNC_REPORT.md`
- `LOCAL_FULL_SYSTEM_TEST_REPORT.md`
- `SECURITY_REVIEW_REPORT.md`
- `SECURITY_FIXES_NEEDED.md`
- `GITHUB_REPOSITORY_PREPARATION_REPORT.md`
- `DEPLOYMENT_PREPARATION_REPORT.md`
- `DEPLOYMENT_ENV_CHECKLIST.md`
- `POST_SPLIT_CLEANUP_PLAN.md`

## Current Verification Status

### Passing Builds

These builds have passed after the split:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-shared`

### Backend Build Status

`breeding-app-backend` currently does not build cleanly.

Known blockers:

- Backend dependencies are not fully installed in the split backend folder.
- Prisma client needs to be generated.
- Backend code still has legacy role references using `lab`.
- New target roles are `lab_owner` and `lab_staff`.

Known affected backend areas include:

- `breeding-app-backend/src/routes/labRoutes.ts`
- `breeding-app-backend/src/routes/mobileRoutes.ts`
- `breeding-app-backend/src/routes/orderRoutes.ts`
- `breeding-app-backend/src/services/orderResultService.ts`
- `breeding-app-backend/src/services/orderService.ts`

### Earlier Test Status

Earlier split-phase tests passed for:

- Breeder app: 8 test files, 44 tests.
- Admin app: 2 test files, 19 tests.
- Lab app: 9 test files, 56 tests.
- Marketplace app: 2 test files, 19 tests.

Earlier split-phase tests were blocked or partially failed for:

- Backend tests, because backend dependencies and Prisma client were missing.
- Shared package tests, because some app/backend-specific test imports still need isolation.

## Important Git State Warning

The Git index appears to already contain many generated artifacts as staged files, including:

- `node_modules`
- `build`
- `dist`
- Vite/Vitest generated files

`.gitignore` files have now been added to each split repository, but `.gitignore` does not automatically unstage files that were already staged.

This should be handled before publishing or committing the final split repositories.

Recommended cleanup approach:

1. Decide whether generated artifacts should be committed. Normally they should not.
2. Unstage/remove generated artifacts from the Git index only after confirming the desired repository policy.
3. Keep source files, config files, reports, migrations, public assets, and required Android/Capacitor files.
4. Re-run `git status` and verify the remaining staged files manually.

Do not delete root legacy app folders or split source folders without explicit approval.

## Security And Deployment Findings

### Security Blockers Before Production

- Production CORS must be tightened.
  - Current backend behavior can allow all origins in production if `CORS_ORIGIN` is empty.
  - Production should fail closed or require explicit allowed origins.
- Deployment secrets must be replaced.
  - Do not use local/dev secrets in hosted environments.
  - Use strong unique `JWT_SECRET` values.
- Marketplace public response fields need approval.
  - Confirm whether fields like seller IDs, owner IDs, row IDs, and public profile/contact fields should be exposed.
- Auth token storage uses `localStorage`.
  - This may be acceptable for local testing, but production hardening should consider secure httpOnly cookies or strict XSS/CSP controls.

### Deployment Status

No deployment has been performed.

Deployment should wait until:

- backend builds cleanly
- backend dependencies and Prisma are installed/generated
- CORS is fixed
- generated artifact cleanup is complete
- environment variables are finalized
- local full-system test passes

## Direct Database / Local Store Findings

Frontend apps do not appear to directly use production database connection strings or service-role credentials.

However, local database/cache-style helpers still exist, especially in the lab/breeder surfaces:

- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-breeder/src/db/cache.ts`
- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/db/cache.ts`

These should be migrated to backend API calls route by route. Do not rewrite them blindly without confirming the backend endpoints and data contracts.

## Shared-Type Migration Status

The shared package now has useful exports, but frontend apps still include duplicated local modules.

Duplicated areas likely include:

- `src/shared/apiClient.ts`
- `src/shared/config/api.ts`
- `src/shared/backendStatus.ts`
- `src/types/*`
- `src/genetics/*`
- lab status/pricing/types
- QR/label/parser helpers

Recommended approach:

1. Wire package imports properly.
2. Replace duplicated modules in small batches.
3. Build and test each app after each batch.
4. Avoid broad rewrites until backend route contracts are stable.

## What Is Required Next

### Priority 1: Stabilize Backend

The backend is the biggest blocker.

Recommended tasks:

1. Install backend dependencies in `breeding-app-backend`.
2. Generate Prisma client.
3. Run backend build.
4. Fix missing dependency/type issues.
5. Resolve `lab` role mismatch.
6. Run backend tests.
7. Start backend locally and verify `/api/health`.

Decision needed:

- Either keep legacy `lab` as a compatibility persisted role and map it to `lab_staff`/`lab_owner`, or update all backend route guards/services to use only `lab_staff` and `lab_owner`.

### Priority 2: Clean Git Index

Before committing/publishing:

1. Review staged generated files.
2. Remove generated artifacts from Git tracking if not intentionally versioned.
3. Keep `.gitignore` files.
4. Confirm clean repository boundaries.

High-risk folders to avoid committing unless explicitly intended:

- `node_modules`
- frontend `build`
- backend/shared `dist`
- `.vite`
- coverage folders

### Priority 3: Complete Backend Route Contracts

Use these reports:

- `DIRECT_DATABASE_CALLS_AUDIT.md`
- `MISSING_BACKEND_ENDPOINTS.md`
- `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`

Needed backend route areas:

- breeder animals
- pairings
- clutches
- egg boxes
- hatchlings
- spaces
- lab orders
- lab QR/certificate lookup
- marketplace public listing routes
- marketplace seller dashboard
- admin settings/moderation/support routes

### Priority 4: Replace Local Stores With API Calls

After backend routes exist:

1. Replace local lab store/cache calls in breeder and lab apps.
2. Keep behavior covered by tests where possible.
3. Verify UI flows manually after each migration.

### Priority 5: Shared Package Import Migration

After backend stabilization:

1. Add shared package dependency strategy.
2. Replace copied shared files with package imports.
3. Run frontend builds and tests after each batch.

### Priority 6: Full Local System Test

Run:

- backend build
- backend tests
- shared build/tests
- all frontend builds/tests
- start backend
- start each frontend app against backend
- verify login/auth role flows
- verify lab, marketplace, breeder, and admin workflows

### Priority 7: Security And Deployment Preparation

Before deploying:

1. Fix production CORS.
2. Verify environment variables.
3. Review token storage risk.
4. Review marketplace public fields.
5. Confirm database credentials are least-privileged.
6. Confirm logs do not expose secrets.
7. Confirm HTTPS-only hosting.

## Suggested Next Plan For JudgeBT

Recommended next execution plan:

1. Inspect `breeding-app-backend/package.json`, `src/types/auth.ts`, role middleware, and lab/order routes.
2. Install/generate backend dependencies if allowed.
3. Fix the `lab` role compatibility issue.
4. Run backend build and tests.
5. Create `BACKEND_STABILIZATION_REPORT.md`.
6. Audit staged files and prepare a safe cleanup plan for generated artifacts.
7. Ask for approval before unstaging/removing generated artifacts.
8. After backend passes, migrate one small frontend local-store/API area as a pilot.

## Files JudgeBT Should Read First

Read in this order:

1. `NEXT_IMPLEMENTATION_STEPS_REPORT.md`
2. `LOCAL_FULL_SYSTEM_TEST_REPORT.md`
3. `SHARED_TYPES_SYNC_REPORT.md`
4. `SECURITY_FIXES_NEEDED.md`
5. `GITHUB_REPOSITORY_PREPARATION_REPORT.md`
6. `POST_SPLIT_CLEANUP_PLAN.md`
7. `MISSING_BACKEND_ENDPOINTS.md`
8. `DIRECT_DATABASE_CALLS_AUDIT.md`
9. `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`

Then inspect backend source files listed above.

## Recommended Safety Rules

- Do not delete root legacy app code yet.
- Do not delete split source code.
- Do not deploy yet.
- Do not commit generated artifacts unless the user explicitly wants that.
- Do not blindly replace local stores until backend route contracts are confirmed.
- Ask for approval before destructive cleanup or broad Git index changes.

