# ChatGPT Complete App Deployment Handoff

Date: 2026-05-16
Repository: `D:\Git Clone\Breeding-planner`
Current branch: `all-branches-merged`

## Purpose

This file gives ChatGPT/JudgeBT a complete working picture of the Breeding Planner app after the repository split and backend finalization work. It explains where the app is now, what has been completed, what is missing, what risks remain, and what should happen before deployment.

## Product Overview

The project started as one combined Breeding Planner application and is being split into separate apps/repositories:

- `breeding-app-breeder`: breeder-facing planner/mobile app.
- `breeding-app-admin`: admin dashboard app.
- `breeding-app-lab`: lab workflow app.
- `breeding-app-marketplace`: marketplace app.
- `breeding-app-backend`: shared hosted API/backend.
- `breeding-app-shared`: shared package for types, genetics, API contracts, pricing helpers, labels, and reusable logic.

The goal is to move from one combined local app into a deployable multi-app platform where all frontends talk to the hosted backend and shared database.

## Current High-Level Status

The split apps exist and are buildable. The backend now builds, tests, and serves a local health endpoint. Generated artifacts were removed from the Git index. The project is closer to deployment, but it is not ready for production deployment yet.

Ready:

- Six split app folders exist.
- Backend builds successfully.
- Backend tests pass.
- All frontend builds pass.
- All frontend tests pass.
- Shared package builds and tests pass.
- Backend `/api/health` smoke test passes locally.
- Production CORS was hardened.
- Android signing secrets were removed from the Git index and ignored.

Not ready:

- Full hosted database runtime has not been verified.
- No deployment has been performed.
- GitHub publication has not been performed.
- Some local store/cache code remains in breeder/lab frontends.
- Backend route contracts are still incomplete for several workflows.
- Shared package imports are not fully adopted by all apps.
- Marketplace public-field exposure still needs review.
- Production secrets and hosting configuration are not finalized.

## Important Reports Already Created

Read these first:

1. `CHATGPT_BACKEND_FINALIZATION_HANDOFF.md`
2. `BACKEND_FINALIZATION_STEPS_REPORT.md`
3. `JUDGEBT_NEXT_STEP_HANDOFF_REPORT.md`
4. `NEXT_IMPLEMENTATION_STEPS_REPORT.md`
5. `LOCAL_FULL_SYSTEM_TEST_REPORT.md`
6. `SHARED_TYPES_SYNC_REPORT.md`
7. `SECURITY_FIXES_NEEDED.md`
8. `GITHUB_REPOSITORY_PREPARATION_REPORT.md`
9. `POST_SPLIT_CLEANUP_PLAN.md`
10. `MISSING_BACKEND_ENDPOINTS.md`
11. `DIRECT_DATABASE_CALLS_AUDIT.md`
12. `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`

## Current Verification Results

### Builds Passing

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

### Tests Passing

- Breeder: 8 files, 44 tests.
- Admin: 2 files, 19 tests.
- Lab: 9 files, 56 tests.
- Marketplace: 2 files, 19 tests.
- Backend: 9 files, 45 tests.
- Shared: 5 files, 40 tests.

### Runtime Smoke Test

Backend was started temporarily on port `4099` with local smoke-test environment values.

Verified:

- `GET /api/health`

Result:

- `status: ok`
- `ok: true`
- `service: breeding-planner-shared-backend`

## Main Code Changes Recently Completed

### Backend Role Compatibility

Files changed:

- `breeding-app-backend/src/middleware/roles.ts`
- `breeding-app-backend/src/services/orderService.ts`
- `breeding-app-backend/src/services/orderResultService.ts`

Reason:

- Older backend code used the legacy persisted role `"lab"`.
- New target app roles use `"lab_owner"` and `"lab_staff"`.

Current behavior:

- `requireRole("lab")` now maps to both `"lab_owner"` and `"lab_staff"`.
- `requireRole("admin")` also allows `"super_admin"`.
- Lab workflow checks now use `isLabRole`.

Important remaining role issue:

- Prisma schema still has legacy enum values such as `admin`, `lab`, `breeder`, `buyer`, `moderator`, `support`.
- App auth types target newer roles: `super_admin`, `admin`, `breeder`, `lab_owner`, `lab_staff`, `buyer`, `viewer`.
- Current compatibility mapping works for runtime, but a future schema migration is needed if the database should persist the new roles directly.

### Backend CORS Hardening

Files changed:

- `breeding-app-backend/src/app.ts`
- `breeding-app-backend/src/config/env.ts`

Current behavior:

- Development remains permissive for local/LAN frontend testing.
- Production requires explicit `CORS_ORIGIN`.
- Production startup throws if no allowed origins are configured.
- Production only allows origins listed in `CORS_ORIGIN`.

### Shared Package Test Scope

File added:

- `breeding-app-shared/vitest.config.mts`

Reason:

- Shared package contained copied tests that imported app-only modules.
- Shared tests now run package-owned tests only.

### Git/Security Cleanup

Files changed:

- `breeding-app-breeder/.gitignore`
- `breeding-app-breeder/android/.gitignore`

Actions:

- Unstaged generated `build`, `dist`, and `node_modules` artifacts.
- Unstaged `breeding-app-breeder/android/key.properties`.
- Added ignore rules for Android signing files.

## Current Git State Notes

The Git index was cleaned of generated artifacts, but many source/config/report files remain staged from the split work.

Known recurring warning:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This warning does not block build/test, but the user environment should fix permissions on that global Git ignore path eventually.

Before any final commit:

- Review `git status`.
- Confirm only intended source/config/report files are staged.
- Do not commit `node_modules`, `build`, `dist`, `.env`, signing files, or generated secrets.

## Deployment Readiness

### Backend

Mostly ready for next-stage deployment preparation, but not production-ready until database and environment setup are confirmed.

Needs:

- Hosted PostgreSQL database.
- Production `DATABASE_URL`.
- Strong production `JWT_SECRET`.
- Explicit production `CORS_ORIGIN`.
- Prisma migrations deployed to hosted DB.
- Seed strategy decided.
- Runtime smoke test against hosted DB.
- Log/security review.

Commands likely needed:

```powershell
npm.cmd --prefix breeding-app-backend install
npm.cmd --prefix breeding-app-backend run prisma:generate
npm.cmd --prefix breeding-app-backend run prisma:migrate:deploy
npm.cmd --prefix breeding-app-backend run build
npm.cmd --prefix breeding-app-backend test
npm.cmd --prefix breeding-app-backend start
```

Do not run migrations against production until environment variables and database target are confirmed.

### Frontends

The frontend apps build and test locally.

Needs before hosted deployment:

- Set each app's production API base URL to the deployed backend.
- Confirm auth flow works from hosted frontend to hosted backend.
- Confirm CORS allows each deployed frontend origin.
- Confirm marketplace public/private route behavior.
- Confirm lab and breeder workflows against hosted backend data.

### Shared Package

Builds and tests pass.

Remaining:

- Decide package consumption strategy:
  - workspace package
  - private npm package
  - copied source for now
- Replace duplicated app-local shared code in small batches.

## Missing Backend Route Contracts

Current backend route groups exist, but several frontend workflows still need proper route contracts.

Missing or incomplete:

- Granular breeder data routes:
  - animals
  - pairings
  - clutches
  - egg boxes
  - hatchlings
  - spaces/rooms/racks/tubs
- Lab QR/sample routes:
  - QR resolve
  - sample lookup
  - mark sample received
  - certificate verification
- Lab artifact routes:
  - order labels
  - sample labels
  - shipment labels
  - certificate/PDF artifacts
- Lab workflow helper routes:
  - status history
  - allowed transitions
  - result entry templates
  - breeder order outcome
  - admin order oversight
- Marketplace:
  - public listing browse/detail safe-field contract
  - public/buyer inquiry contract if needed
- Admin:
  - settings
  - support diagnostics
  - final permission matrix

Use these reports:

- `MISSING_BACKEND_ENDPOINTS.md`
- `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`
- `DIRECT_DATABASE_CALLS_AUDIT.md`

## Remaining Local Store / Cache Work

The frontends still contain local store/cache code, especially in breeder and lab apps.

Important files:

- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-breeder/src/db/cache.ts`
- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/db/cache.ts`

Known local-store service users include:

- lab admin oversight
- lab pricing/catalog services
- test order service
- result entry/finalization services
- sample lookup
- certificate and shipment label services
- shed terminal service
- genetics update engine

Recommended migration approach:

1. Do not rewrite all local-store code at once.
2. Pick one read-only workflow first.
3. Confirm backend route exists.
4. Switch one frontend path to backend API.
5. Build/test.
6. Repeat.

Safest first candidate:

- Lab catalog/pricing reads.

Reason:

- Backend already exposes catalog/pricing routes.
- Frontend API client already has backend call support for these paths.
- It avoids mutating orders/results/certificates/genetics.

## Shared Package Migration Work

Duplicated shared code remains in the frontend apps.

Likely duplicated areas:

- `src/shared/apiClient.ts`
- `src/shared/config/api.ts`
- `src/shared/backendStatus.ts`
- `src/types/*`
- `src/genetics/*`
- lab status/pricing/types
- QR/label/parser helpers

Recommended cleanup:

1. Choose one module family.
2. Add proper shared package dependency/import path.
3. Replace duplicated imports in one app.
4. Build/test.
5. Repeat across apps.

Do not do broad shared import rewrites until backend route contracts are stable.

## Security Items Still Needed

Completed:

- Production CORS now requires explicit origins.
- Android signing file was removed from the Git index and ignored.

Still needed:

- Review marketplace public response fields.
- Confirm which seller/profile/contact fields are public.
- Confirm no bearer tokens/passwords/full request bodies are logged.
- Use strong unique `JWT_SECRET`.
- Use production database credentials with least privilege where possible.
- Decide long-term auth token storage strategy.
- Configure hosted security headers/CSP.
- Confirm HTTPS-only hosting.
- Confirm `.env` files are not committed.

Token storage note:

- Current frontend API clients use `localStorage`.
- This is workable for local/test, but production hardening should consider httpOnly secure same-site cookies or strong CSP/XSS controls.

## Known Warnings / Non-Blocking Issues

- Git global ignore permission warning:
  - `C:\Users\alber/.config/git/ignore`
- Lab PDF tests warn about font fallback in Node test environment.
- Some Vitest runs printed `WebSocket server error: Port is already in use`, but suites passed.
- Breeder build warns about `pdfjs-dist` using `eval`.
- Prisma warns that `package.json#prisma` config is deprecated and should eventually move to `prisma.config.ts`.

## Suggested Next Plan

### Phase 1 - Final Commit Preparation

1. Run `git status`.
2. Review staged and unstaged files.
3. Ensure generated artifacts and secrets are not staged.
4. Stage new report/config files intentionally.
5. Commit the stabilized split/backend finalization work.

Do not commit:

- `node_modules`
- `build`
- `dist`
- `.env`
- `android/key.properties`
- keystore/signing files

### Phase 2 - Hosted Backend Preparation

1. Choose hosting provider for backend.
2. Create hosted PostgreSQL database.
3. Set production env vars:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGIN`
   - `PORT` if required by host
4. Run Prisma migration deploy against hosted DB.
5. Start backend and verify:
   - `/health`
   - `/api/health`
   - `/api/system/health`

### Phase 3 - Frontend API Configuration

1. Set each frontend `VITE_API_URL` or equivalent API base to deployed backend.
2. Confirm CORS includes every deployed frontend origin.
3. Build each frontend for production.
4. Deploy frontends.
5. Test login/auth and role-specific routing.

### Phase 4 - Workflow Verification

Verify manually:

- breeder login
- breeder snapshot/load/save
- animal workflows
- pairing/clutch/incubator workflows
- lab order creation
- lab catalog/pricing display
- lab result workflow
- marketplace listing browse/detail
- marketplace seller dashboard
- admin dashboard
- admin marketplace/lab controls

### Phase 5 - API Migration

After deployment smoke works:

1. Migrate lab catalog/pricing reads away from local store fallback.
2. Add backend route tests.
3. Migrate order/result/sample/certificate workflows in small batches.
4. Replace duplicated shared modules with package imports.

## Recommended Immediate Next Task

The next best task is final Git review and commit preparation.

Why:

- Builds and tests pass now.
- Generated artifacts were removed from index.
- Secret signing file was unstaged and ignored.
- The repo is in a good point-in-time state that should be reviewed and committed before doing bigger route/API migrations.

Recommended command sequence for the next agent:

```powershell
git status --short --branch
git diff --cached --name-only
git diff --name-only
```

Then produce a commit plan before committing.

## Do Not Do Without Explicit Approval

- Do not deploy.
- Do not push to GitHub.
- Do not delete legacy root app folders.
- Do not delete split app source folders.
- Do not run production database migrations.
- Do not commit generated artifacts.
- Do not commit signing secrets.
- Do not broadly replace local stores without route-by-route verification.

