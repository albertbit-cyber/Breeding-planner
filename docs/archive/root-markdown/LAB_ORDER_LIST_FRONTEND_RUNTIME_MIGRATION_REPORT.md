# Lab Order List Frontend Runtime Migration Report

Date: 2026-05-17

## Result

No code change needed for the active lab order list path.

The lab frontend order list client already reads from the backend API through:

```text
GET /api/lab/orders
```

## Files Reviewed

```text
breeding-app-lab/src/features/lab/api/client.ts
breeding-app-lab/src/features/lab/pages/IncomingOrdersPage.jsx
breeding-app-lab/src/features/lab/pages/CompletedTestsPage.jsx
breeding-app-lab/src/features/lab/pages/ResultEntryPage.jsx
```

## Active API Paths

| Frontend function | Backend behavior |
| --- | --- |
| `listBreederTestOrders()` | Uses `fetchMyOrders()` / `/lab/orders` |
| `listLabTestOrders()` | Uses `listSharedOrdersRaw()` / `/lab/orders` |
| `getBreederTestOrderDetails()` | Uses `/lab/orders/:id` |

## Verification

| Check | Result |
| --- | --- |
| Runtime backend order list | Passed |
| Runtime backend order detail | Passed |
| Runtime status update | Passed |
| Runtime payment update | Passed |
| Lab frontend build | Passed |
| Lab frontend tests | Passed |
| Backend targeted tests | Passed |

## Remaining Scope

Do not migrate order detail/status/payment UI further in this step. Those paths should remain separate follow-up work if deeper browser-level verification or UI changes are needed.

