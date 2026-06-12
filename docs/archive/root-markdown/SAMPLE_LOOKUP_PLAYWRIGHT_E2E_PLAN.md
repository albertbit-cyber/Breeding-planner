# Sample Lookup Playwright E2E Plan

## Scenario

Open Sample Intake, enter the synthetic sample ID for seeded order `05AA00001`, resolve it, verify linked context, submit intake, and confirm backend status update.

## Assertions

- `GET /api/lab/orders` is called.
- Linked order context appears.
- Order number and sample ID are visible.
- `PATCH /api/lab/orders/:id/status` is called on intake submit.
- Order moves to `in_progress`.

