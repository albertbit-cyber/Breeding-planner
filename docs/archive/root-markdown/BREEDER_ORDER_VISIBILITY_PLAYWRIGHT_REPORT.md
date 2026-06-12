# Breeder Order Visibility Playwright Report

## Implemented

- Added `breeding-app-lab/tests/e2e/breeder-lab-workflow.spec.ts`.
- Added breeder API login support in `breeding-app-lab/tests/e2e/helpers.ts`.

## Covered

- Breeder authenticates through backend API.
- Breeder lists lab orders through `GET /api/lab/orders`.
- Seeded order is visible to the breeder.
- Breeder opens seeded order detail through `GET /api/lab/orders/:id`.

## Verification

- `npm.cmd run test:e2e -- breeder-lab-workflow.spec.ts`: 4 passed including setup.
- Full `npm.cmd run test:e2e`: 19 passed.

## Gap

This is API-level Playwright coverage. Browser-level breeder frontend coverage remains future work.
