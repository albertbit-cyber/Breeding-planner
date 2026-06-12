# Git Review After Breeder Lab

## Current Stage Files Added/Changed

- `breeding-app-backend/src/tests/orderServiceVisibility.test.ts`
- `breeding-app-backend/src/tests/orderRoutes.test.ts`
- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-lab/tests/e2e/breeder-lab-workflow.spec.ts`
- Deleted duplicate nested files under `breeding-app-breeder/src/features/lab/components/components`.
- Breeder-lab report files 169-190.

## Pre-Existing Dirty/Untracked Context

The working tree already contains many previous-stage changes and reports, including root `src/App.jsx`, `src/App.css`, Lab config/package files, backend result service work, and earlier handoff reports.

## Warnings

- Git reports line-ending warnings on several tracked files.
- Git reports permission denied reading `C:\Users\alber/.config/git/ignore`.

## Suggested Commit Grouping

1. Backend breeder-lab order visibility/order creation tests.
2. Lab Playwright breeder workflow API tests and helper updates.
3. Reports/handoffs.

Do not include `.env`, Playwright reports, traces, screenshots, videos, downloads, or auth state.
