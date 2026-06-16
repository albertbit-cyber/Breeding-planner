# Lab Order Detail Status Payment UI Audit

Date: 2026-05-17

## Scope

Step 105 inspected the Lab order detail, status, and payment UI before adding new browser E2E tests.

## Files Reviewed

- `breeding-app-lab/src/features/lab/pages/IncomingOrdersPage.jsx`
- `breeding-app-lab/src/features/lab/pages/OrderDetailsPage.jsx`
- `breeding-app-lab/src/features/lab/pages/CompletedTestsPage.jsx`
- `breeding-app-lab/src/features/lab/pages/ResultEntryPage.jsx`
- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-lab/tests/e2e/lab-order-list.spec.ts`
- `breeding-app-backend/src/routes/orderRoutes.ts`
- `breeding-app-backend/src/controllers/orderController.ts`
- `breeding-app-backend/src/services/orderService.ts`
- `breeding-app-backend/src/tests/orderRoutes.test.ts`

## UI Findings

- The Lab order list is reachable through the Lab shell navigation button `All Shed Orders`.
- `IncomingOrdersPage` renders a Kanban-style order list with a search field and per-card `Open` button.
- `OrderDetailsPage` is routed by hash path `/lab/orders/:orderId`.
- Detail view sections include:
  - `Order Overview`
  - `Payment`
  - `Sample & Intake Details`
  - `Workflow Actions`
  - `Test Results & Certificate`
  - `Status History Timeline`
- The workflow status button labels are based on allowed next statuses:
  - submitted -> `Set Sample Received`
  - received -> `Set Testing in Progress`
  - in_progress -> `Set Completed`
- Payment action buttons:
  - unpaid/non-approved -> `Mark as Paid`
  - paid -> `Revert to Pending`

## Backend Endpoint Findings

- `GET /api/lab/orders` lists visible orders.
- `GET /api/lab/orders/:id` loads order detail.
- `PATCH /api/lab/orders/:id/status` updates workflow status.
- `PATCH /api/lab/orders/:id/payment` updates payment status.

## Seeded Data Assumption

- Local PostgreSQL seed/runtime stage created order `05AA00001`.
- Tests use `E2E_EXPECTED_ORDER_NUMBER`, defaulting to `05AA00001`.

## Risks

- Some visible text appears more than once, so Playwright assertions must scope or use `.first()`.
- The top shell has `Open Lab App`; tests must avoid matching that button when they intend an order card's `Open` button.
- Status/payment tests mutate local data, so they must reset the seeded order before each mutation test.

## Result

The UI and backend are suitable for focused Playwright coverage of detail opening, status update, and payment update.
