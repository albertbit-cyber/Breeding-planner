# Lab Order Payment Update E2E Plan

Date: 2026-05-17

## Goal

Add a safe repeatable browser test for marking the seeded order as paid from the order detail page.

## Test Plan

1. Authenticate through the existing Playwright setup.
2. Find seeded order `05AA00001` through the local backend.
3. Reset payment status to `pending`.
4. Open `/lab/orders/:id`.
5. Assert the UI shows `Pending`.
6. Click `Mark as Paid`.
7. Wait for `PATCH /api/lab/orders/:id/payment`.
8. Assert backend response payment status is `paid`.
9. Assert UI shows `Paid` and `Revert to Pending`.

## Safety

- The test uses only local PostgreSQL.
- The test resets payment to `pending` before the browser action.
- No forced cleanup or production data access is involved.

## Rollback

The same endpoint can reset local payment status to `pending`.
