# Sample QR Workflow Audit

Date: 2026-05-18

## Current Flow

- The Lab sample intake UI lives in `breeding-app-lab/src/features/lab/pages/SampleIntakePage.jsx`.
- The page accepts:
  - synthetic sample ID
  - 64-character QR token
  - raw QR payload JSON
- In shared backend mode, lookup is frontend-derived from backend order data:
  - list shared orders
  - build synthetic sample IDs from order ID and animal index
  - build stable QR tokens from order ID, animal ID, and sample ID
  - render linked order/sample context
- Intake submission patches the backend order status:
  - acceptable/borderline/degraded -> `in_progress`
  - insufficient -> `received`

## Backend State

- There is no dedicated shared backend sample lookup or QR lookup route yet.
- The currently tested backend calls are:
  - `GET /api/lab/orders`
  - `GET /api/lab/orders/:id`
  - `PATCH /api/lab/orders/:id/status`

## Selectors

- Page heading: `Sample Intake`
- Input placeholder: `Paste 64-char QR token, sample ID, or full QR payload JSON`
- Resolve button: `Resolve Token`
- Result section: `Linked Order Context`
- Submit button: `Submit Intake Decision`

## Risks

- Synthetic sample IDs/tokens are frontend-calculated, not persisted sample rows in the shared backend.
- Dedicated backend authorization for sample/QR lookup cannot be tested until backend routes exist.
- Camera scanning is not used in E2E; tests use manual input.

