# One Order Fallback Removal Report

Date: 2026-05-17

## Cleanup Performed

Removed one obsolete order fallback dependency from:

- `breeding-app-lab/src/features/lab/api/client.ts`

Specifically, removed the unused import from:

- `./testOrderHandlers`

## Why This Was Safe

- The imported handler symbols were not referenced anywhere in `client.ts`.
- Active Lab order list/detail/status/payment paths use shared backend API calls.
- The local handler and store modules were not deleted.
- Unmigrated workflows can still be reviewed separately.

## Verification After Cleanup

Lab:

- `npm.cmd test` passed, 56 tests.
- `npm.cmd run build` passed.
- `npm.cmd run test:e2e` passed, 9 tests.

## Not Removed

- `breeding-app-lab/src/features/lab/api/testOrderHandlers.ts`
- `breeding-app-lab/src/services/lab/testOrderService.ts`
- `breeding-app-lab/src/db/labStore.ts`

These remain because other workflows still reference local fallback behavior.
