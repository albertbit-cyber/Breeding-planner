# Repo Split Execution Report

Generated for Step 14.

## Scope

The repository split was prepared inside the current workspace. The original combined app was not deleted or refactored.

Created prepared project folders:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

No deployment was performed.

## What Was Created

Each prepared repo has:

- `README.md`
- `.env.example`
- `package.json` where needed
- build/test scripts
- copied source subset

Frontend apps also have app-specific entry shells:

- `breeding-app-breeder/src/AppEntry.jsx`
- `breeding-app-admin/src/AppEntry.jsx`
- `breeding-app-lab/src/AppEntry.jsx`
- `breeding-app-marketplace/src/AppEntry.jsx`

Each copied frontend `src/index.jsx` now imports its local `AppEntry.jsx` instead of the combined `AuthShell.jsx`.

## What Was Copied

### `breeding-app-breeder`

Copied breeder-facing source:

- `src/App.jsx`
- `src/App.css`
- `src/index.jsx`
- breeder source from `src/features/animals`, `src/features/breedingAdvisor`, `src/features/suggestions`, `src/features/labels`
- breeding components from `src/components/breeding`
- hooks, genetics, shared API/backend status, contexts, i18n, locales, label constants, data/config needed by breeder build
- breeder-side lab ordering components and supporting lab utilities/services
- marketplace page copy for current breeder-owned listing workflows
- Electron, Capacitor, Android, and iOS packaging candidates
- public assets and PDF/font assets needed by build

### `breeding-app-admin`

Copied admin-facing source:

- `src/admin`
- auth, shared API/backend status, appearance context, i18n/locales
- shared backend banner/guard/language switcher
- temporary marketplace page copy for current admin marketplace moderation behavior

### `breeding-app-lab`

Copied lab-facing source:

- `src/features/lab`
- lab services and pricing services
- lab types, test catalog data, test pricing config
- lab token helper, lab PDF helpers, lab certificate/logo/font assets
- auth, shared API/backend status, appearance context, i18n/locales
- local lab store dependencies needed by the current lab build

### `breeding-app-marketplace`

Copied marketplace-facing source:

- `src/features/marketplace`
- `src/features/subscriptions`
- auth, shared API/backend status, appearance context, i18n/locales
- public marketplace assets
- shared type dependencies

### `breeding-app-backend`

Copied backend source:

- `server/src` to `breeding-app-backend/src`
- `server/prisma` to `breeding-app-backend/prisma`
- `server/package.json`
- `server/package-lock.json`
- `server/tsconfig.json`
- `server/vitest.config.ts`

Generated backend `.env.example` with backend-only secrets documented.

### `breeding-app-shared`

Copied shared package candidates:

- shared API config/status/client helpers
- genetics logic and genetics config data
- quick-add animal parser
- pairing and lab types
- label presets and lab label utilities
- pricing calculation logic
- auth/API DTO candidates
- subscription catalog candidate

Added:

- `breeding-app-shared/src/index.ts`
- `breeding-app-shared/tsconfig.json`
- `breeding-app-shared/package.json`

The shared package currently excludes the local-store-backed lab genetics update engine from `tsconfig` build because it still depends on app/backend-specific services.

## What Was Removed Or Skipped

Nothing was removed from the original combined repo.

Skipped from copied repos:

- root `node_modules`
- root `build`
- root `dist`
- server `node_modules`
- server `dist`
- log files
- real `.env` files
- generated zip archives
- local Node distribution folders

## Build Results

| Repo | Command | Result |
| --- | --- | --- |
| `breeding-app-breeder` | `npm --prefix breeding-app-breeder run build` | Passed |
| `breeding-app-admin` | `npm --prefix breeding-app-admin run build` | Passed |
| `breeding-app-lab` | `npm --prefix breeding-app-lab run build` | Passed |
| `breeding-app-marketplace` | `npm --prefix breeding-app-marketplace run build` | Passed |
| `breeding-app-shared` | `npm --prefix breeding-app-shared run build` | Passed |
| `breeding-app-backend` | `npm --prefix breeding-app-backend run build` | Failed |

Backend build failure:

- Missing local dependencies in the extracted backend folder, including `express`, `cors`, `helmet`, `morgan`, `@prisma/client`, `bcryptjs`, `jsonwebtoken`, `zod`, `supertest`, and related type packages.
- This is expected until `npm install` is run inside `breeding-app-backend` and Prisma client generation is completed.

## Test Results

| Repo | Command | Result |
| --- | --- | --- |
| `breeding-app-breeder` | `npm --prefix breeding-app-breeder test` | Passed: 8 files, 44 tests |
| `breeding-app-admin` | `npm --prefix breeding-app-admin test` | Passed: 2 files, 19 tests |
| `breeding-app-lab` | `npm --prefix breeding-app-lab test` | Passed: 9 files, 56 tests |
| `breeding-app-marketplace` | `npm --prefix breeding-app-marketplace test` | Passed: 2 files, 19 tests |
| `breeding-app-backend` | `npm --prefix breeding-app-backend test` | Failed: 7 files passed, 2 suites failed |
| `breeding-app-shared` | `npm --prefix breeding-app-shared test` | Failed: 5 files passed, 2 suites failed |

Backend test failures:

- `auth.test.ts` could not resolve `supertest`.
- `orderNumber.test.ts` could not resolve `@prisma/client`.
- Backend needs local install and Prisma generation.

Shared package test failures:

- `geneticsUpdateEngine.test.ts` imports `../../db/labStore`, which should not live in the shared package.
- `labelLayout.test.js` imports `../../../utils/pdf/labOrderLabelsPdf`, which was not copied into shared and should be evaluated as app-owned versus shared.

Warnings during successful frontend tests:

- Vitest printed `WebSocket server error: Port is already in use` while still exiting successfully.
- Lab label layout tests logged PDF font fallback warnings in Node test mode while still passing.

## What Still Needs Manual Work

- Run `npm install` inside each final repo folder or create fresh lockfiles per repo.
- Decide whether to use npm or pnpm consistently.
- Generate Prisma client inside `breeding-app-backend`.
- Normalize role names across frontend/backend, especially current `lab`, `lab_staff`, and planned `lab_owner` roles.
- Replace copied shared source in frontend apps with real imports from `breeding-app-shared`.
- Remove backend/local-store dependencies from the shared package.
- Split `src/shared/apiClient.ts` into core client and domain clients.
- Remove temporary cross-domain copies, especially marketplace code inside breeder/admin and lab service code inside breeder.
- Replace admin marketplace reuse with admin-owned moderation screens.
- Decide whether Electron/Android/iOS stay in `breeding-app-breeder` or become separate shells later.
- Add CI for each repo after dependency installation.

## Known Risks

- The split folders are prepared extraction folders, not independent production repos yet.
- The breeder app still contains a large copied `src/App.jsx` and several temporary lab/marketplace dependencies needed for build compatibility.
- The backend and shared package still need dependency installation and module-boundary cleanup.
- Shared package boundaries must be cleaned before publishing to avoid leaking app-specific or backend-only code.
- Build output folders were generated inside prepared frontend/shared repos during verification.

