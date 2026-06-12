# Lab Order Payment Update E2E Implementation Report

Date: 2026-05-17

## Implemented

Added a payment update test in:

- `breeding-app-lab/tests/e2e/lab-order-detail-status-payment.spec.ts`

The test:

- Finds the seeded local order.
- Resets payment to `pending`.
- Opens the detail page.
- Clicks `Mark as Paid`.
- Verifies `PATCH /api/lab/orders/:id/payment`.
- Verifies backend response payment status is `paid`.
- Verifies the UI shows the paid state and exposes `Revert to Pending`.

## Verification

Specific spec run passed.

Full Playwright suite passed with 9 tests.
