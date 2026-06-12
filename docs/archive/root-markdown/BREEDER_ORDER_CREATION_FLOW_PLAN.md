# Breeder Order Creation Flow Plan

## Backend Flow

- Breeder selects animal(s) and requested tests.
- Frontend sends `POST /api/lab/orders` with `animals`.
- Backend validates payload, calculates pricing, creates order, order animals, and ordered tests.
- Created order is scoped to authenticated breeder id.

## UI Flow

- Batch order cart calls `createBatchOrder`.
- On success, label artifact generation can run from the created order id.

## Tests

- Route tests for breeder-only POST.
- API E2E creates a local order as seeded breeder, then lists orders and confirms the new id appears.
- Future browser E2E should cover selecting animals/tests from the breeder UI.
