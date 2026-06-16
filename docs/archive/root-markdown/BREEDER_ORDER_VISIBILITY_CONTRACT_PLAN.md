# Breeder Order Visibility Contract Plan

## Contract

- Breeder users can list and detail only orders where `ShedTestOrder.breederId` equals the authenticated user id.
- Lab staff/admin can list and detail all orders.
- Buyer/viewer users cannot access lab order workflows.
- Breeder-visible order detail includes order status, payment status, animals, ordered tests, and result summaries needed for read-only tracking.

## Hidden/Internal Fields

- Keep internal lab-only mutation routes blocked for breeders: result draft, result submit, status update, payment update, delete.
- Avoid exposing backend secrets, tokens, admin notes, or unrelated breeder records.

## Tests Needed

- Service tests for breeder own-list, own-detail, foreign-detail 403, buyer 403, lab/admin all-order behavior.
- Route tests for order creation role gates.
- E2E/API tests using local seeded breeder and local PostgreSQL.

## Decision

Use the existing backend contract. Add tests instead of changing route/service behavior.
