# Result Submission Backend Contract Plan

## Goal

Confirm and test the existing submit endpoint as the final result contract.

## Route

- `POST /api/lab/orders/:id/results/submit`
- Requires authenticated `admin` or `lab` role.
- Delegates to `saveOrderResult(routeOrderId, payload, user, "submit")`.

## Expected Behavior

- Reject unauthenticated requests with `401`.
- Reject breeder/buyer access with `403`.
- Reject invalid payload with `400`.
- Reject missing orders with `404`.
- Require every ordered test for every ordered animal.
- Move the order to `completed`.
- Return saved result(s), updated order, and mode `submit`.

## Test Plan

- Add route tests for success, forbidden access, missing order, and validation propagation.
- Cover final behavior with Playwright against local PostgreSQL.

