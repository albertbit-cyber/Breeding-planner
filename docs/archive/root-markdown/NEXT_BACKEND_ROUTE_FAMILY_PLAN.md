# Next Backend Route Family Plan

Date: 2026-05-17
Scope: Step 68

## Chosen Route Family

Lab order list/detail/status/payment.

## Why This Is Next

- It is the next migration priority after catalog/pricing.
- Backend routes already exist.
- Frontend hosted API client already contains several lab order backend calls.
- It is less risky than result submission, sample QR, labels/certificates, or genetics updates.

## Existing Backend Routes

- `POST /api/lab/orders/calculate-price`
- `POST /api/lab/orders`
- `GET /api/lab/orders`
- `GET /api/lab/orders/:id`
- `PATCH /api/lab/orders/:id/status`
- `PATCH /api/lab/orders/:id/payment`
- `DELETE /api/lab/orders/:id`
- `DELETE /api/lab/orders`

## Roles

- breeder:
  - calculate price
  - create own order
  - list own orders
  - get own order detail
- lab/admin:
  - list orders
  - get order detail
  - update status
  - update payment
  - remove order where allowed

## Tests Needed

Backend route tests:

- authenticated breeder can list orders
- buyer cannot list lab orders
- legacy persisted lab role maps to `lab_staff`
- invalid status is rejected
- lab staff can update status
- missing payment status is rejected

## Rollback

- Keep frontend local-store paths until the backend order routes are tested.
- Migrate one frontend flow at a time.

