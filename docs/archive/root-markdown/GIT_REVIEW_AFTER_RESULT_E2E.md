# Git Review After Result E2E

## Current Branch

- `all-branches-merged`

## Result Stage Files

- `breeding-app-backend/src/services/orderResultService.ts`
- `breeding-app-backend/src/tests/orderRoutes.test.ts`
- `breeding-app-lab/tests/e2e/auth.setup.ts`
- `breeding-app-lab/tests/e2e/lab-result-entry.spec.ts`
- `breeding-app-lab/tests/e2e/order-test-helpers.ts`
- Result stage report files in repo root.

## Pre-Existing Dirty/Untracked Context

The worktree already contains many untracked reports and earlier E2E setup files from previous stages. It also includes unrelated modified app files such as root `src/App.jsx`, `src/App.css`, and breeder app modal work.

## Do Not Commit

- Local `.env` files.
- Playwright auth storage.
- Playwright report/test-results artifacts.
- Any generated build output.

## Suggested Commit Grouping

1. Backend result draft/submit hardening and tests.
2. Lab result Playwright E2E helpers/spec.
3. Stage reports/handoff documentation.

