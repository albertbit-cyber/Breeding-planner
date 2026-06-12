# Result Draft Backend Contract Plan

## Goal

Harden the existing draft endpoint instead of adding a new route.

## Route

- `POST /api/lab/orders/:id/results/draft`
- Requires authenticated `admin` or `lab` role.
- Delegates to `saveOrderResult(routeOrderId, payload, user, "draft")`.

## Expected Behavior

- Reject unauthenticated requests with `401`.
- Reject breeder/buyer access with `403`.
- Reject missing result payload with `400`.
- Reject missing orders with `404`.
- Allow partial draft result entry.
- Move order from `received` to `in_progress`.

## Test Plan

- Add route tests for success, unauthorized, forbidden, validation error, and missing order.
- Run backend targeted tests and build.

