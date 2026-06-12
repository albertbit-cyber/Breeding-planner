# ChatGPT Database E2E 76-90 Handoff

Date: 2026-05-17
Repo: `D:\Git Clone\Breeding-planner`
Branch: `all-branches-merged`

## Purpose

This file gives ChatGPT enough context to plan the next stage after completing database-backed E2E steps 76-90. It summarizes what was done, what was verified, what changed in the repo, what is still missing, and what the next prompt should focus on.

## Current Project State

The project has been split into app packages:

- `breeding-app-backend`
- `breeding-app-lab`
- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-marketplace`
- `breeding-app-shared`

The current stage focused on moving from planned/local fallback behavior into a real local PostgreSQL-backed runtime verification for the backend, lab catalog/pricing, login, and lab order list/runtime APIs.

## Database Decision

The selected database runtime option is local PostgreSQL on this machine.

Production database was not used and must not be used for these local E2E stages.

Created:

- `DATABASE_RUNTIME_OPTION_DECISION.md`
- `LOCAL_POSTGRES_SETUP_GUIDE.md`
- `BACKEND_ENV_MANUAL_CHECKLIST.md`

## Env And Safety Work

Created:

- `breeding-app-backend/.env`

Important: this file contains local development values and should not be committed or shared.

Updated:

- `.gitignore`

Added ignore rule:

```text
/breeding-app-backend/.env
```

Verified:

- `breeding-app-backend/.env` exists.
- `git check-ignore breeding-app-backend/.env` reports the file path.
- Required backend env keys are present.
- `DATABASE_URL` points to localhost.
- PostgreSQL is listening on `localhost:5432`.

Created:

- `ENV_AND_DATABASE_SAFETY_VERIFICATION.md`

## Local PostgreSQL Work

Local database used:

```text
breeding_planner_local
```

The database did not exist initially, so it was created locally.

Prisma commands run:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:migrate:deploy
npm.cmd run prisma:seed
```

Important result:

- `prisma:generate` passed.
- `prisma:migrate` applied migrations but then stopped because `prisma migrate dev` is interactive in this shell.
- `prisma:migrate:deploy` passed and reported no pending migrations.
- `prisma:seed` passed.

Created:

- `PRISMA_LOCAL_MIGRATION_REPORT.md`
- `MINIMAL_E2E_SEED_DATA_PLAN.md`
- `MINIMAL_E2E_SEED_DATA_REPORT.md`

## Seed Data

The existing backend seed script was used:

```text
breeding-app-backend/prisma/seed.ts
```

Seed output confirmed:

```text
Seed complete: admin/lab/breeder/buyer users + catalog + pricing + admin advanced tool samples created.
```

Seeded local test coverage includes:

- Admin user
- Lab user
- Breeder user
- Buyer user
- Lab test catalog
- Active pricing config
- Lab account
- Marketplace/admin sample data

Known seeded user emails used in runtime checks:

- `breeder@proherper.dev`
- `lab@proherper.dev`

Do not print or share passwords/tokens in future reports.

## Backend Runtime Verification

The backend was built and run against the local PostgreSQL database.

Commands used:

```powershell
npm.cmd run build
node dist/server.js
```

Verified endpoints:

```text
GET /api/health
POST /api/auth/login
GET /api/lab/tests/catalog?breederView=true
GET /api/lab/tests/pricing
```

Results:

- Health passed.
- Login passed with seeded breeder user.
- Returned role was `breeder`.
- Catalog returned 44 tests.
- Pricing config was present.

Created:

- `BACKEND_REAL_DATABASE_RUNTIME_REPORT.md`
- `LOGIN_RUNTIME_WITH_DATABASE_REPORT.md`
- `LAB_CATALOG_PRICING_RUNTIME_E2E_REPORT.md`

## Frontend Runtime Verification

The lab frontend was used for this stage.

Frontend URL:

```text
http://localhost:5174/
```

Backend URL:

```text
http://localhost:4000
```

API base:

```text
http://127.0.0.1:4000/api
```

Port note:

- `5173` was already in use.
- `breeding-app-lab` was started on `5174`.

Verified:

- Lab frontend served HTTP 200.
- Lab app build passed.
- Lab app tests passed.

Created:

- `FRONTEND_BACKEND_RUNTIME_CONNECTION_REPORT.md`

## Catalog/Pricing Fallback Result

Step 86 expected removing catalog/pricing fallback after E2E. Inspection showed no code removal was needed for the active path because the lab API client already reads catalog/pricing through the shared backend API.

Reviewed files:

- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-lab/src/shared/apiClient.ts`
- `FIRST_FRONTEND_STORE_API_MIGRATION_REPORT.md`
- `REMAINING_LOCAL_STORE_MIGRATION_PLAN.md`

Active backend-backed functions include:

- `fetchTestCatalog()`
- `fetchPricingConfig()`
- `apiRequest("/lab/tests/catalog?...")`
- `apiRequest("/lab/tests/pricing")`

Decision:

- Do not remove broader local lab store modules yet.
- Remaining local store modules support other unmigrated flows and should be removed one flow at a time.

Created:

- `CATALOG_PRICING_FALLBACK_REMOVAL_AFTER_E2E_REPORT.md`
- `POST_FALLBACK_REMOVAL_E2E_REPORT.md`

## Lab Order Runtime Work

Created a real local test order through the backend API instead of direct database writes.

Flow:

1. Log in as seeded breeder.
2. Fetch catalog.
3. Select first two catalog test IDs.
4. Create one lab order via `POST /api/lab/orders`.

Created order:

```text
Order number: 05AA00001
Status: submitted
Animal count: 1
```

Then verified:

```text
GET /api/lab/orders
GET /api/lab/orders/:id
PATCH /api/lab/orders/:id/status
PATCH /api/lab/orders/:id/payment
```

Results:

- Breeder order list returned 1 order.
- Breeder order detail passed.
- Lab role changed status to `received`.
- Lab role changed payment to `paid`.

Created:

- `LAB_ORDER_RUNTIME_SEED_PLAN.md`
- `LAB_ORDER_RUNTIME_SEED_REPORT.md`
- `LAB_ORDER_BACKEND_RUNTIME_VERIFICATION_REPORT.md`
- `LAB_ORDER_LIST_FRONTEND_RUNTIME_MIGRATION_REPORT.md`

## Lab Order Frontend Migration Result

Inspection showed no code change was needed for the active lab order list path.

Reviewed:

- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-lab/src/features/lab/pages/IncomingOrdersPage.jsx`
- `breeding-app-lab/src/features/lab/pages/CompletedTestsPage.jsx`
- `breeding-app-lab/src/features/lab/pages/ResultEntryPage.jsx`

Active backend-backed paths:

- `listBreederTestOrders()` uses `fetchMyOrders()` / `/lab/orders`
- `listLabTestOrders()` uses `listSharedOrdersRaw()` / `/lab/orders`
- `getBreederTestOrderDetails()` uses `/lab/orders/:id`

No broad local store removal was done.

## Verification Summary

Passed:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:migrate:deploy
npm.cmd run prisma:seed
npm.cmd run build
npm.cmd test
```

Specific test results:

- `breeding-app-lab`: 56 tests passed.
- `breeding-app-backend`: targeted auth/lab/order tests passed, 24 tests passed.

Backend targeted test command:

```powershell
npm.cmd test -- labRoutes.test.ts auth.test.ts orderRoutes.test.ts
```

Lab app test command:

```powershell
npm.cmd test
```

Lab app build command:

```powershell
npm.cmd run build
```

## Current Running Services

At the end of the stage, these were running:

```text
Backend: http://localhost:4000
Lab frontend: http://localhost:5174
```

Known process IDs at that time:

```text
Backend PID: 22100
Lab frontend PID: 45116
```

These may no longer be running in a later session. Re-check with `netstat -ano | findstr :4000` and `netstat -ano | findstr :5174`.

## Known Warnings And Issues

1. Browser E2E is not automated.

No Playwright/Cypress runner is configured. The frontend server and backend/API-client path were verified, but not browser console/network behavior.

Recommended next step:

- Add a small Playwright smoke test that logs in and confirms network calls for:
  - `/api/lab/tests/catalog`
  - `/api/lab/tests/pricing`
  - `/api/lab/orders`

2. Prisma config deprecation warning.

Prisma warns that `package.json#prisma` seed config is deprecated for Prisma 7.

Recommended future cleanup:

- Move Prisma seed/config to a Prisma config file before upgrading to Prisma 7.

3. `prisma migrate dev` is interactive.

In this environment, `npm.cmd run prisma:migrate` applied migrations and then stopped because `migrate dev` is interactive. Use this for existing migrations:

```powershell
npm.cmd run prisma:migrate:deploy
```

4. Lab test warning about PDF font fetch.

Lab tests pass, but one test prints a warning:

```text
[pdfFonts] Failed to apply Unicode font, falling back to defaults.
```

This happens in Node test context when fetching `/src/assets/fonts/NotoSans-Regular.ttf`. It is non-blocking but worth cleaning later.

5. Git global ignore warning.

Git repeatedly prints:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This did not block local work, but it should be fixed on the machine eventually.

6. Dirty worktree note.

`src/App.jsx` was already modified and was not touched during this stage.

Current stage added/updated many report files and `.gitignore`. `breeding-app-backend/.env` is ignored and should remain untracked.

## Main Stage Report

The overall stage report is:

```text
DATABASE_E2E_STEPS_76_90_REPORT.md
```

Use that file as the primary concise summary. This handoff file is the fuller ChatGPT context.

## Recommended Next Work

The next stage should focus on turning the current runtime verification into repeatable browser E2E and then continue one narrow migration area at a time.

Recommended priorities:

1. Add Playwright or another browser E2E runner.
2. Create a local E2E smoke test for backend + lab frontend.
3. Test login in browser with seeded user.
4. Assert catalog/pricing network calls use backend API.
5. Assert lab order list loads the seeded order.
6. Decide whether to keep or remove local demo/offline fallback modules after browser E2E passes.
7. Continue with the next lab flow only after order list/browser E2E is stable.

## Suggested Prompt For ChatGPT

```text
Read CHATGPT_DATABASE_E2E_76_90_HANDOFF.md and DATABASE_E2E_STEPS_76_90_REPORT.md.

Plan the next stage after database E2E steps 76-90.

Goal:
- Add repeatable browser E2E coverage for the local backend + lab frontend.
- Use local PostgreSQL only.
- Do not use production.
- Do not print secrets.
- Do not remove broad local stores yet.

Tasks:
1. Inspect the repo for existing browser E2E tooling.
2. If none exists, propose the smallest Playwright setup for the lab app.
3. Create a test plan for:
   - backend health,
   - lab frontend loads,
   - seeded breeder login,
   - catalog/pricing backend network calls,
   - lab order list showing seeded order 05AA00001 or equivalent seeded order.
4. Identify what code/config must change and what should remain untouched.
5. Tell me what you understood and what you are going to do before coding.
```

