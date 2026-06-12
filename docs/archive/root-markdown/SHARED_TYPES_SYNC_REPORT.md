# Shared Types Sync Report

Date: 2026-05-16

## Scope

This report covers step 26, syncing shared types across the extracted apps.

## Completed

- Extended `breeding-app-shared` with shared exports for:
  - genetics helpers
  - auth roles and permissions
  - API response helpers
  - marketplace listing types
  - pairing, lab, lab status, lab pricing, label presets, backend status, API config, and quick-add parser modules
- Added backend auth/role foundation types and middleware support in `breeding-app-backend`.
- Confirmed `breeding-app-shared` builds successfully.

## Current State

- The shared package is usable as the source of truth, but the frontend apps still contain copied local modules for several shared areas.
- The backend now has target role names, but some existing route/service code still refers to the legacy `lab` role.
- The split apps currently build because they still carry local copies of required shared code.

## Known Mismatches

- Backend role mismatch:
  - target roles include `lab_owner` and `lab_staff`
  - existing backend code still uses `lab` in several route guards and service calls
- Frontend duplication remains in:
  - `src/shared/apiClient.ts`
  - `src/shared/config/api.ts`
  - `src/shared/backendStatus.ts`
  - `src/types/*`
  - `src/genetics/*`
  - lab status, pricing, QR, label, and parser helpers

## Verification

- `npm.cmd --prefix breeding-app-shared run build` passed.
- Breeder, admin, lab, and marketplace frontend builds passed.
- Backend build did not pass because local backend dependencies and Prisma client are not installed/generated, and because of the remaining role mismatch.

## Remaining Work

- Wire all apps to consume the shared package through workspace/package-manager configuration or a package registry.
- Replace duplicated frontend shared modules with package imports in small batches.
- Normalize legacy `lab` role handling before enforcing target role names everywhere.
- Add type-level checks in each app after shared imports are switched over.

