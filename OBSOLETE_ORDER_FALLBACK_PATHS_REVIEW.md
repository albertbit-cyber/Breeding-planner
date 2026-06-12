# Obsolete Order Fallback Paths Review

Date: 2026-05-17

## Scope

Reviewed order-related local fallback paths after adding browser E2E for Lab order detail, status update, and payment update.

## Backend-Backed Paths Now Verified

- Order list via `/api/lab/orders`
- Order detail via `/api/lab/orders/:id`
- Workflow status update via `/api/lab/orders/:id/status`
- Payment update via `/api/lab/orders/:id/payment`

## Active Backend Client Paths

In `breeding-app-lab/src/features/lab/api/client.ts`:

- `listLabTestOrders`
- `getLabTestOrderDetails`
- `getLabOrderStatusHistory`
- `updateLabOrderWorkflowStatus`
- `updateLabOrderPaymentStatus`

These paths now use the shared backend API.

## Local Fallback Still Present

The following modules still contain local order/store behavior and must remain until related workflows are migrated:

- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/services/lab/testOrderService.ts`
- `breeding-app-lab/src/features/lab/api/testOrderHandlers.ts`
- `breeding-app-lab/src/services/lab/resultEntryService.ts`
- `breeding-app-lab/src/services/lab/resultFinalizationService.ts`
- `breeding-app-lab/src/services/lab/certificateService.ts`
- `breeding-app-lab/src/services/lab/sampleLookupService.ts`
- `breeding-app-lab/src/services/lab/shedTerminalService.ts`
- `breeding-app-lab/src/services/lab/shipmentLabelService.ts`

Equivalent copied Lab service modules also exist in `breeding-app-breeder`.

## Safe Cleanup Candidate

`breeding-app-lab/src/features/lab/api/client.ts` still imported the local order handler module even though the active backend-backed order paths no longer use those handlers.

## Recommendation

Remove only the unused local order handler import from the Lab API client. Do not delete `testOrderHandlers.ts`, `testOrderService.ts`, or `db/labStore.ts` yet.
