# Result E2E Seed Reset Implementation Report

## Implemented

- Added `breeding-app-lab/tests/e2e/order-test-helpers.ts`.
- Helper functions:
  - find seeded order by `E2E_EXPECTED_ORDER_NUMBER`.
  - patch order status.
  - patch payment status.
  - reset seeded order for result entry.

## Behavior

- Draft test resets order to `received`.
- Submit test resets order to `in_progress`.
- Each test writes a unique result test code.

## Safety

The helper uses normal authenticated backend API routes. It does not add any test-only backend reset endpoint.

