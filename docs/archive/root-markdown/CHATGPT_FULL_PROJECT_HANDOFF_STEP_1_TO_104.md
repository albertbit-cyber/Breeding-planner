# ChatGPT Full Project Handoff: Step 1 Through Step 104

Date: 2026-05-17

Repository: `D:\Git Clone\Breeding-planner`

Current working branch: `all-branches-merged`

## Purpose

This file is a complete handoff for ChatGPT/JudgeBT so it can understand what has been done from the first planning/split steps through the current Playwright E2E stage, inspect the current state, and generate safe next-step instructions.

It consolidates the work from the planning files, split-app execution, backend finalization, API migration, local PostgreSQL runtime verification, and Playwright browser E2E setup.

## High-Level Product State

The project started as one combined Breeding Planner app and is being converted into a deployable multi-app platform.

Current split app folders:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

The target architecture is:

- Frontend apps use shared API contracts and shared utilities.
- Frontends communicate with `breeding-app-backend`.
- Backend uses PostgreSQL through Prisma.
- Local fallback/localStorage stores are removed only one workflow at a time after backend route and E2E verification.
- Deployment should happen only after local and staging gates pass.

## Work Completed By Stage

### Stage 1: Initial App Fixes Before Split Planning

Before the formal repo split and backend stages, the combined app received multiple user-facing fixes and feature improvements.

Completed areas included:

- Egg box splitting for clutches over 10 eggs.
- Odd clutch split handling, such as 13 eggs splitting into 6 and 7.
- Egg box label text overflow fixes.
- Clutch and egg box numbering corrections based on date laid, not current active status count.
- Incubator numbering fixes after completed/hatched clutches.
- Hatchling entry as a floating modal with blurred background.
- Snake edit card and delete confirmations adjusted toward floating modal behavior.
- Add animal / scan QR / import animals modal behavior fixes.
- Free text genetics parsing fixes, especially `het`, `50% het`, and `66% het` gene handling.
- Appearance options:
  - visually impaired preset
  - larger font / higher contrast direction
  - breeder logo background option
  - solid light gray background option
- Incubator summary:
  - clutch count
  - box count
  - egg total
- Incubator egg box edit/view notes modal.
- Egg box bad-egg update behavior reducing active egg count.
- Snake image upload display fixes and fit-to-frame behavior.
- Several local UI/report/zip/support requests.

Important note:

- The current work did not re-review all of those early app fixes.
- The root files `src/App.jsx` and `src/App.css` remain dirty in the current worktree and were treated as pre-existing user/app changes during the later backend/E2E stages.

### Stage 2: Planning And Repo Audit

The project moved into a structured step-file plan. Early files included project audit, target architecture, backup branch creation, shared logic extraction planning, environment planning, permissions planning, and repo split execution planning.

Completed outputs include:

- `CODEBASE_SPLIT_AUDIT.md`
- `PLANNING_PHASE_REPORT.md`
- `BREEDER_REPO_EXTRACTION_PLAN.md`
- `LAB_REPO_EXTRACTION_PLAN.md`
- `ADMIN_REPO_EXTRACTION_PLAN.md`
- `MARKETPLACE_REPO_EXTRACTION_PLAN.md`
- `BACKEND_API_PLAN.md`
- `SHARED_LOGIC_EXTRACTION_PLAN.md`
- `SHARED_DATABASE_SCHEMA_PLAN.md`
- `ENVIRONMENT_CONFIGURATION_PLAN.md`
- `AUTH_AND_PERMISSIONS_PLAN.md`
- `TESTING_AND_DEPLOYMENT_PLAN.md`

Main result:

- The repository was mapped and a conservative split architecture was planned.

### Stage 3: Backup Branch And Split App Creation

A backup branch was created before larger changes.

The split app structure was created/normalized:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

Completed outputs include:

- `BACKUP_BRANCH_REPORT.md`
- `REPO_SPLIT_EXECUTION_REPORT.md`
- `BREEDER_REPO_IMPLEMENTATION_REPORT.md`
- `LAB_REPO_IMPLEMENTATION_REPORT.md`
- `ADMIN_REPO_IMPLEMENTATION_REPORT.md`
- `MARKETPLACE_REPO_IMPLEMENTATION_REPORT.md`
- `BACKEND_REPO_IMPLEMENTATION_REPORT.md`
- `SHARED_PACKAGE_IMPLEMENTATION_REPORT.md`
- `POST_SPLIT_CLEANUP_PLAN.md`
- `GITHUB_REPOSITORY_PREPARATION_REPORT.md`

Main result:

- Split app folders exist and became the active target for backend/API/deployment work.

### Stage 4: Backend Finalization, Build/Test Stabilization, And Git Cleanup

Backend finalization steps covered build fixes, route compatibility, CORS hardening, test cleanup, and safe Git index cleanup.

Important backend changes:

- Role compatibility was fixed:
  - legacy `lab` support maps to newer lab role behavior
  - `lab_owner` and `lab_staff` are allowed for lab routes
  - `super_admin` is allowed where admin compatibility is needed
- Production CORS was hardened:
  - production requires explicit `CORS_ORIGIN`
  - development remains permissive for local/LAN testing
- Shared package Vitest config was scoped to package-owned tests.
- Generated artifacts were removed from Git index.
- Android signing files were ignored and removed from staging.

Completed outputs include:

- `CHATGPT_BACKEND_FINALIZATION_HANDOFF.md`
- `BACKEND_FINALIZATION_STEPS_REPORT.md`
- `BACKEND_ROUTES_IMPLEMENTATION_REPORT.md`
- `SECURITY_REVIEW_REPORT.md`
- `LOCAL_FULL_SYSTEM_TEST_REPORT.md`
- `APPROVED_GIT_CLEANUP_EXECUTION_REPORT.md`
- `STABILIZED_SPLIT_COMMIT_REPORT.md`

Verification at that stage:

- Backend build passed.
- Backend tests passed.
- Split frontend builds passed.
- Split frontend tests passed.
- Shared package build/tests passed.
- Backend `/api/health` smoke test passed locally.

### Stage 5: API Migration Planning And First Backend-Backed Slice

Steps 44-58 focused on selecting the first low-risk API migration and preparing deployment-facing plans.

Chosen first migration candidate:

- Lab catalog/pricing reads.

Reason:

- Read-heavy.
- Lower risk than order/result/certificate workflows.
- Existing backend routes already supported this area.
- Frontend API client already had backend-aware functions.

Completed outputs include:

- `CHATGPT_NEXT_STEPS_AFTER_API_MIGRATION_HANDOFF.md`
- `API_MIGRATION_STEPS_44_58_REPORT.md`
- `FIRST_LOCAL_STORE_MIGRATION_CANDIDATE.md`
- `FIRST_API_CONTRACT.md`
- `FIRST_BACKEND_ENDPOINT_IMPLEMENTATION_REPORT.md`
- `FIRST_FRONTEND_STORE_API_MIGRATION_REPORT.md`
- `FIRST_API_MIGRATION_E2E_VERIFICATION_REPORT.md`
- `REMAINING_LOCAL_STORE_MIGRATION_PLAN.md`
- `MARKETPLACE_PUBLIC_FIELDS_REVIEW.md`
- `TOKEN_STORAGE_SECURITY_DECISION.md`
- `FINAL_PREDEPLOYMENT_TEST_PLAN.md`

Verification:

- Backend route tests for catalog/pricing were added and passed.
- Full local builds/tests were passing across the split apps at that time.

### Stage 6: E2E Staging Planning Steps 59-75

Steps 59-75 covered branch strategy, staging/database setup planning, E2E staging readiness, local/staging environment decisions, and pre-runtime verification.

Completed output:

- `CHATGPT_E2E_STAGING_STEPS_59_75_HANDOFF.md`

Main decisions:

- No production database should be used for local E2E.
- Local PostgreSQL was selected for the next runtime verification stage.
- Push/deployment decisions remained approval-gated.

### Stage 7: Local PostgreSQL Runtime Verification Steps 76-90

Steps 76-90 moved the project from static build/test verification into real local database-backed backend runtime verification.

Database decision:

- Use local PostgreSQL on the user machine.
- Do not use production.

Local database:

- `breeding_planner_local`

Environment:

- `breeding-app-backend/.env` was created from `.env.example`.
- It contains local values and must remain untracked.
- `.gitignore` was updated to ignore `/breeding-app-backend/.env`.

Prisma/database work:

- Prisma generate passed.
- Prisma migrations were applied/confirmed.
- Prisma seed passed.
- Seed created admin/lab/breeder/buyer users, lab catalog, pricing, lab account, marketplace/admin sample data.

Known seeded runtime values:

- Lab email: `lab@proherper.dev`
- Breeder email: `breeder@proherper.dev`
- Seeded lab order number created later: `05AA00001`

Do not print or commit seeded passwords or tokens.

Runtime verified:

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/lab/tests/catalog?breederView=true`
- `GET /api/lab/tests/pricing`
- `GET /api/lab/orders`
- `GET /api/lab/orders/:id`
- `PATCH /api/lab/orders/:id/status`
- `PATCH /api/lab/orders/:id/payment`

Created real local order:

- Order number: `05AA00001`
- Status: `submitted`, later status/payment runtime transitions were verified.

Completed outputs include:

- `CHATGPT_DATABASE_E2E_76_90_HANDOFF.md`
- `DATABASE_E2E_STEPS_76_90_REPORT.md`
- `DATABASE_RUNTIME_OPTION_DECISION.md`
- `LOCAL_POSTGRES_SETUP_GUIDE.md`
- `BACKEND_ENV_MANUAL_CHECKLIST.md`
- `ENV_AND_DATABASE_SAFETY_VERIFICATION.md`
- `PRISMA_LOCAL_MIGRATION_REPORT.md`
- `MINIMAL_E2E_SEED_DATA_PLAN.md`
- `MINIMAL_E2E_SEED_DATA_REPORT.md`
- `BACKEND_REAL_DATABASE_RUNTIME_REPORT.md`
- `LOGIN_RUNTIME_WITH_DATABASE_REPORT.md`
- `LAB_CATALOG_PRICING_RUNTIME_E2E_REPORT.md`
- `LAB_ORDER_RUNTIME_SEED_PLAN.md`
- `LAB_ORDER_RUNTIME_SEED_REPORT.md`
- `LAB_ORDER_BACKEND_RUNTIME_VERIFICATION_REPORT.md`
- `LAB_ORDER_LIST_FRONTEND_RUNTIME_MIGRATION_REPORT.md`

Verification:

- Backend targeted tests passed.
- Lab tests passed.
- Lab build passed.
- Backend runtime worked against real local PostgreSQL.

### Stage 8: Playwright Browser E2E Steps 91-104

Steps 91-104 added repeatable browser E2E coverage for the Lab app against the local PostgreSQL-backed backend.

Playwright was added to:

- `breeding-app-lab`

Main files added:

- `breeding-app-lab/.env.e2e.example`
- `breeding-app-lab/playwright.config.ts`
- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-lab/tests/e2e/auth.setup.ts`
- `breeding-app-lab/tests/e2e/backend-health.spec.ts`
- `breeding-app-lab/tests/e2e/lab-frontend.spec.ts`
- `breeding-app-lab/tests/e2e/seeded-login.spec.ts`
- `breeding-app-lab/tests/e2e/catalog-pricing-network.spec.ts`
- `breeding-app-lab/tests/e2e/lab-order-list.spec.ts`

Main files changed:

- `.gitignore`
- `breeding-app-lab/package.json`
- `breeding-app-lab/package-lock.json`
- `breeding-app-lab/vite.config.mts`

Playwright behavior:

- Starts/reuses backend at `http://127.0.0.1:4000`.
- Starts/reuses Lab frontend at `http://127.0.0.1:4173`.
- Uses one worker.
- Creates ignored auth state at `breeding-app-lab/playwright/.auth/lab.json`.
- Keeps one real UI-login test with empty browser storage.

E2E tests now cover:

- Backend health.
- Authenticated Lab frontend shell.
- Seeded lab UI login.
- Catalog backend API call.
- Pricing backend API reachability.
- Seeded order list showing `05AA00001`.

Vitest fix:

- `breeding-app-lab/vite.config.mts` now excludes `tests/e2e/**` so Vitest does not try to run Playwright specs.

Completed outputs include:

- `CHATGPT_PLAYWRIGHT_E2E_91_104_HANDOFF.md`
- `PLAYWRIGHT_E2E_STEPS_91_104_REPORT.md`
- `EXISTING_BROWSER_E2E_TOOLING_AUDIT.md`
- `MINIMAL_PLAYWRIGHT_SETUP_PLAN.md`
- `PLAYWRIGHT_DEPENDENCY_INSTALL_REPORT.md`
- `E2E_ENV_TEMPLATE_REPORT.md`
- `BACKEND_HEALTH_PLAYWRIGHT_TEST_REPORT.md`
- `LAB_FRONTEND_LOADS_PLAYWRIGHT_REPORT.md`
- `SEEDED_LOGIN_PLAYWRIGHT_REPORT.md`
- `CATALOG_PRICING_NETWORK_E2E_REPORT.md`
- `LAB_ORDER_LIST_E2E_REPORT.md`
- `E2E_RUNNER_DOCUMENTATION.md`
- `LOCAL_QUALITY_GATE_WITH_E2E.md`
- `LOCAL_FALLBACK_MODULES_POST_E2E_REVIEW.md`
- `NEXT_FRONTEND_API_MIGRATION_AFTER_E2E_PLAN.md`
- `STAGING_READINESS_AFTER_E2E_REPORT.md`

Latest verification:

- Backend targeted tests: 24 passed.
- Backend TypeScript build: passed.
- Lab unit tests: 56 passed.
- Lab production build: passed.
- Lab Playwright E2E: 6 passed.

## Current Quality Gate Commands

Backend:

```powershell
cd breeding-app-backend
npm.cmd test -- labRoutes.test.ts auth.test.ts orderRoutes.test.ts
npm.cmd run build
```

Lab:

```powershell
cd breeding-app-lab
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

For Playwright E2E, the local backend `.env`, PostgreSQL database, migrations, and seed must already be valid.

## Current Git State Notes

At the last check, the worktree included:

Modified:

- `.gitignore`
- `breeding-app-lab/package.json`
- `breeding-app-lab/vite.config.mts`
- `src/App.css`
- `src/App.jsx`

Untracked new files include many report files, the Lab Playwright config/tests, and `breeding-app-lab/package-lock.json`.

Important:

- `src/App.jsx` and `src/App.css` were pre-existing dirty files from earlier app work and were not touched during the latest Playwright E2E stage.
- `breeding-app-backend/.env` is ignored and must remain untracked.
- `breeding-app-lab/playwright/.auth`, `breeding-app-lab/playwright-report`, and `breeding-app-lab/test-results` are ignored.

Recurring Git warning:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This is a local machine/global Git ignore permission issue. It has not blocked builds/tests.

## Known Warnings And Risks

### Dependency Audit

Installing Playwright reported npm audit findings:

- 5 moderate
- 1 critical

No forced audit fix was applied because it can cause dependency churn and should be reviewed separately.

### Prisma Deprecation

Backend startup reports:

```text
package.json#prisma is deprecated and will be removed in Prisma 7
```

Future cleanup should move Prisma seed/config to `prisma.config.ts`.

### Lab PDF Font Warning

Lab unit tests pass but log:

```text
[pdfFonts] Failed to apply Unicode font, falling back to defaults.
```

This happens in Node/Vitest when fetching `/src/assets/fonts/NotoSans-Regular.ttf`.

### Lab Build Circular Chunk Warning

Lab production build passes but reports a circular chunk warning involving:

- `vendor`
- `vendor-react`

### Remaining Local Stores

Do not remove local fallback/localStorage modules broadly yet.

Important remaining files/modules:

- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/db/cache.ts`
- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-breeder/src/db/cache.ts`

Remaining workflow areas still needing careful migration:

- Lab order detail/status/payment browser coverage.
- Result entry.
- Result finalization.
- Certificate generation.
- Sample lookup.
- QR lookup.
- Shed terminal.
- Shipment labels.
- Admin oversight.
- Genetics update logging.
- Breeder-facing lab flows.
- Granular breeder animal/pairing/clutch/egg box/hatchling/space routes.

UI preferences, auth session, i18n settings, appearance settings, and carts may intentionally continue using `localStorage`.

### Marketplace Public Field Safety

Marketplace public browsing should not be opened until a public-safe DTO is confirmed.

Sensitive fields needing review include:

- seller internal IDs
- owner/user IDs
- contact fields
- conversation/sale IDs
- public data settings

### Auth Token Storage

Current frontend auth uses `localStorage`.

Short-term:

- Acceptable for local/staging with strong XSS/CSP discipline.

Long-term:

- Consider httpOnly secure same-site cookies with CSRF protection.

Do not change auth storage without a separate migration plan.

## Deployment Readiness

The app is not production-ready yet.

Ready locally:

- Split app folders exist.
- Backend builds.
- Backend route/auth/order tests pass.
- Lab app builds.
- Lab unit tests pass.
- Lab Playwright E2E passes against local PostgreSQL-backed backend.
- Local seed data and order `05AA00001` support repeatable Lab E2E.

Not ready:

- No staging database has been provisioned.
- No hosted backend deployment has been performed.
- No production/staging frontend API URL configuration has been validated.
- No production secrets setup has been verified.
- No staging CORS origin list has been tested.
- No staging Prisma migration deploy has been run.
- Dependency audit findings remain.
- Several workflows still depend on local fallback modules.

## Recommended Next Step

The next safest engineering step is to extend backend-backed Playwright coverage to the Lab order detail/status/payment workflow using the seeded order `05AA00001`.

Reason:

- Backend route tests already cover order detail/status/payment behavior.
- Browser E2E already proves login and order list.
- This is the natural next workflow before result entry/certificates.
- It reduces risk before removing any local fallback code.

Suggested next prompt:

```text
Read CHATGPT_FULL_PROJECT_HANDOFF_STEP_1_TO_104.md and CHATGPT_PLAYWRIGHT_E2E_91_104_HANDOFF.md.

Continue with the next safe API migration/E2E slice:
- Add backend-backed Playwright coverage for Lab order detail/status/payment using seeded order 05AA00001.
- Do not remove broad local fallback modules yet.
- Keep local PostgreSQL only.
- Do not print secrets.
- After E2E passes, identify the smallest obsolete fallback path that can be removed safely.
- Run the local quality gate and create a new handoff report.
```

## Alternative Next Step If Preparing For Staging

If the next goal is staging instead of more workflow migration:

```text
Read CHATGPT_FULL_PROJECT_HANDOFF_STEP_1_TO_104.md.

Create a staging deployment preparation plan only. Do not deploy.
Include:
- staging PostgreSQL setup,
- backend env vars,
- frontend API env vars,
- CORS origins,
- Prisma migration deploy plan,
- seed/test user strategy,
- rollback plan,
- secret handling,
- local-to-staging E2E gate.
Wait for approval before changing code or running deployment commands.
```

## Do Not Do Without Explicit Approval

- Do not push to GitHub.
- Do not deploy.
- Do not run production database migrations.
- Do not use production database for local tests.
- Do not commit `.env` files.
- Do not commit Playwright auth state, reports, traces, videos, screenshots, or test artifacts.
- Do not commit Android signing files or keystores.
- Do not delete root legacy app files unless requested.
- Do not delete split app folders.
- Do not broadly remove `db/labStore` or local fallback modules.
- Do not change token storage strategy without a dedicated plan.
- Do not make marketplace browsing public without a public-safe DTO.

## Most Important Files For The Next ChatGPT Session

Read these first:

1. `CHATGPT_FULL_PROJECT_HANDOFF_STEP_1_TO_104.md`
2. `CHATGPT_PLAYWRIGHT_E2E_91_104_HANDOFF.md`
3. `PLAYWRIGHT_E2E_STEPS_91_104_REPORT.md`
4. `LOCAL_QUALITY_GATE_WITH_E2E.md`
5. `CHATGPT_DATABASE_E2E_76_90_HANDOFF.md`
6. `DATABASE_E2E_STEPS_76_90_REPORT.md`
7. `CHATGPT_NEXT_STEPS_AFTER_API_MIGRATION_HANDOFF.md`
8. `CHATGPT_COMPLETE_APP_DEPLOYMENT_HANDOFF.md`
9. `REMAINING_LOCAL_STORE_MIGRATION_PLAN.md`
10. `STAGING_READINESS_AFTER_E2E_REPORT.md`

