# Result Draft Backend Implementation Report

## Implemented

- Hardened `breeding-app-backend/src/services/orderResultService.ts`.
- Draft mode now filters empty `animalResults` groups before validation.
- Draft mode still requires at least one filled result item.
- Added route tests in `breeding-app-backend/src/tests/orderRoutes.test.ts`.

## Why

The UI sends every animal group, but a draft may only contain one filled row. Empty groups should not make partial draft saving fail.

## Verified

- `npm.cmd test -- orderRoutes.test.ts` in `breeding-app-backend`: passed, 12 tests.
- `npm.cmd run build` in `breeding-app-backend`: passed.
- Full backend `npm.cmd test`: passed, 60 tests.

