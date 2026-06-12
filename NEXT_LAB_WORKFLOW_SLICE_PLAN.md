# Next Lab Workflow Slice Plan

Date: 2026-05-17

## Recommended Next Slice

Result entry draft and result submission.

## Why This Slice

- Order detail/status/payment now has browser E2E coverage.
- `OrderDetailsPage` already exposes `InlineResultEntry` when status allows result entry.
- Backend already has routes for:
  - `POST /api/lab/orders/:id/results/draft`
  - `POST /api/lab/orders/:id/results/submit`
- Result entry is the next direct workflow after order status/payment.

## Files To Inspect Next

- `breeding-app-lab/src/features/lab/components/InlineResultEntry.jsx`
- `breeding-app-lab/src/features/lab/pages/ResultEntryPage.jsx`
- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-backend/src/controllers/orderController.ts`
- `breeding-app-backend/src/services/orderResultService.ts`
- `breeding-app-backend/src/routes/orderRoutes.ts`

## Proposed Tests

1. Reset seeded order to `received` or `in_progress`.
2. Open order detail.
3. Enter a draft result.
4. Wait for `POST /api/lab/orders/:id/results/draft`.
5. Assert draft success state.
6. In a separate test, submit a complete result if seed data has enough requested tests and animal data.

## Risks

- Result payload must include a status for every ordered test when submitting.
- Result submission can move order status toward `completed`.
- Certificate generation depends on completed results, so keep it as a later slice.

## Rollback

Use local PostgreSQL only and reset seeded order status before tests. Do not remove result local fallback modules until browser E2E proves the backend path.
