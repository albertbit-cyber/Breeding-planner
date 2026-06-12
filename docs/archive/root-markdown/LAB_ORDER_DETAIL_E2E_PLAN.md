# Lab Order Detail E2E Plan

Date: 2026-05-17

## Goal

Add a Playwright test that opens the seeded backend order from the Lab order list and verifies the order detail screen.

## Test Plan

1. Authenticate as the seeded lab user through the existing setup project.
2. Use the backend API with the same seeded lab credentials to find order `05AA00001`.
3. Open the Lab app.
4. Navigate to `All Shed Orders`.
5. Search for `05AA00001`.
6. Click the order card's `Open` button from inside `main`.
7. Wait for `GET /api/lab/orders/:id`.
8. Assert the detail page renders:
   - `Shed Test Order Details`
   - `Order Overview`
   - `Workflow Status`
   - `Payment Status`
   - `Requested Tests`
   - `Status History Timeline`

## Selector Notes

- Scope the order-card open button to `main` to avoid clicking the shell `Open Lab App` button.
- Scope repeated text assertions with `.first()` where the same label appears in multiple detail sections.

## Rollback

The detail test is read-only and does not mutate local data.
