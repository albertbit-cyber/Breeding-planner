# ChatGPT Next Steps After API Migration Handoff

Date: 2026-05-17
Repository: `D:\Git Clone\Breeding-planner`
Branch: `all-branches-merged`

## Purpose

This report is for ChatGPT/JudgeBT to understand the current state after the split-app stabilization, backend finalization, and API migration planning steps. It explains what was done, what is verified, what is still missing, and what the next plan should be.

## Current Git State

The branch is ahead of origin by 3 commits:

```text
504cf94 fix: persist normalized auth roles
e08457d docs: record api migration planning
7b0b66f chore: stabilize split app repositories
```

No push or deployment has been performed.

At the last check:

- no staged files remained
- generated artifacts were not staged
- signing file `breeding-app-breeder/android/key.properties` was not staged

Known recurring local warning:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This appears to be a local Git/global-ignore permission issue, not an app build blocker.

## What Has Been Done

### Split App Repositories

The original combined app has been split into:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

Each split repo has source/config files and `.env.example` coverage. Generated folders were removed from the Git index.

### Backend Stabilization

Completed:

- backend dependencies installed locally
- Prisma client generated
- backend builds
- backend tests pass
- backend health smoke test passed previously on `/api/health`
- production CORS hardened
- legacy `lab` role compatibility fixed
- normalized auth role persistence committed

Important backend role behavior:

- persisted legacy `lab` role is normalized to `lab_staff`
- `requireRole("lab")` allows `lab_owner` and `lab_staff`
- `requireRole("admin")` also allows `super_admin`
- auth tokens include normalized `role` and optional `persistedRole`

### API Migration Steps 44-58

Completed reports:

- `FINAL_STAGED_FILE_AUDIT.md`
- `CLEAN_COMMIT_PLAN.md`
- `APPROVED_GIT_CLEANUP_EXECUTION_REPORT.md`
- `STABILIZED_SPLIT_COMMIT_REPORT.md`
- `FIRST_LOCAL_STORE_MIGRATION_CANDIDATE.md`
- `FIRST_API_CONTRACT.md`
- `FIRST_BACKEND_ENDPOINT_IMPLEMENTATION_REPORT.md`
- `FIRST_FRONTEND_STORE_API_MIGRATION_REPORT.md`
- `FIRST_API_MIGRATION_E2E_VERIFICATION_REPORT.md`
- `REMAINING_LOCAL_STORE_MIGRATION_PLAN.md`
- `SHARED_PACKAGE_CLEANUP_BATCH_1_REPORT.md`
- `MARKETPLACE_PUBLIC_FIELDS_REVIEW.md`
- `TOKEN_STORAGE_SECURITY_DECISION.md`
- `PRODUCTION_ENVIRONMENT_FINAL_CHECKLIST.md`
- `FINAL_PREDEPLOYMENT_TEST_PLAN.md`
- `API_MIGRATION_STEPS_44_58_REPORT.md`

### First API Migration Candidate

Chosen candidate:

- lab catalog/pricing reads

Reason:

- low risk
- read-heavy
- backend endpoints already exist
- hosted frontend API client already uses these backend paths
- avoids high-risk mutation workflows like orders, results, certificates, samples, and genetics updates

Backend contract tests were added:

- `breeding-app-backend/src/tests/labRoutes.test.ts`

Covered:

- authenticated breeder-view catalog read
- unauthenticated catalog request rejection
- authenticated active pricing read

## Current Verification Results

All builds and tests passed after the latest work.

### Backend

- Build passed.
- Tests passed: 10 test files, 48 tests.

### Shared Package

- Build passed.
- Tests passed: 5 test files, 40 tests.

### Breeder App

- Build passed.
- Tests passed: 8 test files, 44 tests.

### Admin App

- Build passed.
- Tests passed: 2 test files, 19 tests.

### Lab App

- Build passed.
- Tests passed: 9 test files, 56 tests.

### Marketplace App

- Build passed.
- Tests passed: 2 test files, 19 tests.

## Important Existing Reports To Read

Read these first:

1. `CHATGPT_COMPLETE_APP_DEPLOYMENT_HANDOFF.md`
2. `CHATGPT_BACKEND_FINALIZATION_HANDOFF.md`
3. `API_MIGRATION_STEPS_44_58_REPORT.md`
4. `FINAL_PREDEPLOYMENT_TEST_PLAN.md`
5. `PRODUCTION_ENVIRONMENT_FINAL_CHECKLIST.md`
6. `REMAINING_LOCAL_STORE_MIGRATION_PLAN.md`
7. `MARKETPLACE_PUBLIC_FIELDS_REVIEW.md`
8. `TOKEN_STORAGE_SECURITY_DECISION.md`
9. `MISSING_BACKEND_ENDPOINTS.md`
10. `DIRECT_DATABASE_CALLS_AUDIT.md`
11. `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`

## What Is Still Missing

### 1. Push/Publication Decision

The local branch is ahead by 3 commits.

Still needed:

- decide whether to push `all-branches-merged`
- decide whether this branch becomes the final base branch
- decide whether to publish split repos separately or keep them inside this repo for now

Do not push without explicit approval.

### 2. Real End-To-End Runtime Test

Builds/tests pass, but true full-system runtime verification still needs:

- a real local or staging PostgreSQL database
- backend started with valid `DATABASE_URL`
- frontend started against backend
- real login/session flow
- catalog/pricing UI verified through network requests

The first selected API migration is backend-tested but not manually browser-E2E verified.

### 3. Remaining Local Store Migrations

Remaining local store/cache files:

- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-breeder/src/db/cache.ts`
- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/db/cache.ts`

Remaining migration areas:

- lab catalog/pricing fallback removal
- lab order list/detail/status/payment
- result draft/submit
- sample lookup and QR
- labels/certificates
- genetics update engine

Do not migrate all at once.

### 4. Missing Backend Route Contracts

Still needed:

- granular breeder animal routes
- pairings routes
- clutch routes
- egg box routes
- hatchling routes
- spaces/rooms/racks/tubs routes
- lab QR/sample routes
- certificate/PDF artifact routes
- marketplace public listing DTO/routes if public browsing is desired
- admin support/settings diagnostics

### 5. Shared Package Import Cleanup

Split apps still contain duplicated shared code.

Recommended first cleanup family:

- API config/backend status helpers

Before changing imports:

- decide package dependency strategy:
  - workspace
  - `file:../breeding-app-shared`
  - private package registry

### 6. Marketplace Public Field Safety

Marketplace browsing currently requires auth. Before making it public, create a public-safe response DTO.

Fields requiring review:

- `sellerUserId`
- internal seller `id`
- `rowId`
- `ownerId`
- `publicDataSettings`
- contact fields
- conversation/sale identifiers

### 7. Token Storage Security

Current frontend auth uses `localStorage`.

Short-term decision:

- keep localStorage for staging/local while enforcing strict XSS/CSP discipline

Long-term decision:

- move to secure httpOnly same-site cookies with CSRF protection

Do not change auth storage without a dedicated plan.

### 8. Production Environment

Required before deployment:

- production `DATABASE_URL`
- production `JWT_SECRET`
- explicit production `CORS_ORIGIN`
- frontend `VITE_API_URL` values pointing to backend `/api`
- HTTPS hosting
- database backups
- migration deploy process

Use:

- `PRODUCTION_ENVIRONMENT_FINAL_CHECKLIST.md`

## Recommended Next Plan

### Step 1 - Decide Push/Branch Strategy

Ask user:

- Push `all-branches-merged` to origin?
- Keep split apps in one repo for now?
- Or create separate repos later?

Do not push until approved.

### Step 2 - Run Local Full-System E2E With Real DB

Goal:

- verify backend and one frontend running together with real database connection.

Suggested flow:

1. Confirm local/staging PostgreSQL `DATABASE_URL`.
2. Run Prisma migrate deploy.
3. Seed if required.
4. Start backend.
5. Start breeder or lab frontend.
6. Log in.
7. Verify lab catalog/pricing UI calls backend.
8. Document result in a new report.

Create:

- `LOCAL_E2E_RUNTIME_VERIFICATION_REPORT.md`

### Step 3 - Migrate One Remaining Local Store Flow

Recommended:

- remove or bypass local lab catalog/pricing fallback only after E2E confirms backend path.

Keep changes narrow:

- one app
- one flow
- one backend contract
- build/test after change

### Step 4 - Add Backend Contracts For Next Migration

Next likely area:

- lab order list/detail/status/payment

Add backend tests before frontend migration.

### Step 5 - Shared Package Cleanup Batch

After API migrations are stable:

- choose API config/backend status helpers
- update one app first
- build/test
- repeat

### Step 6 - Predeployment Security Review

Before deployment:

- marketplace public DTO decision
- token storage mitigation decision
- production env review
- CORS check
- secret scan

### Step 7 - Deployment Dry Run

Only after E2E and security gates:

- deploy backend to staging
- run migrations against staging DB
- deploy one frontend to staging
- verify auth and API calls
- expand to remaining frontends

## Suggested Immediate Next Task For Codex

The most useful next task is:

```text
Run local full-system E2E with real/staging database and create LOCAL_E2E_RUNTIME_VERIFICATION_REPORT.md.
```

If no database is available yet, the next task should be:

```text
Prepare a local/staging PostgreSQL setup checklist and verify environment variables without running migrations.
```

## Do Not Do Without Approval

- Do not push.
- Do not deploy.
- Do not delete legacy root source folders.
- Do not delete split app folders.
- Do not run production database migrations.
- Do not expose secrets.
- Do not commit generated artifacts.
- Do not make marketplace browsing public without a public-safe DTO.
- Do not change token storage strategy without a dedicated migration plan.

