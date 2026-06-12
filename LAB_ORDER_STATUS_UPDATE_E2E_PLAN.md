# Lab Order Status Update E2E Plan

Date: 2026-05-17

## Goal

Add a safe repeatable browser test for changing the seeded order workflow status from the order detail page.

## Test Plan

1. Authenticate through the existing Playwright setup.
2. Find seeded order `05AA00001` through `GET /api/lab/orders`.
3. Reset the order to `submitted` through the local backend API.
4. Open `/lab/orders/:id` in the Lab app.
5. Assert current status shows `Submitted`.
6. Fill the optional transition note.
7. Click `Set Sample Received`.
8. Wait for `PATCH /api/lab/orders/:id/status`.
9. Assert backend response status is `received`.
10. Assert the UI shows `Sample Received`.

## Safety

- The test mutates only the local PostgreSQL seeded order.
- It resets the order status at the start, so repeated runs are safe.
- No production database is used.

## Rollback

The next test or manual API call can set the local order back to `submitted`; the backend currently accepts canonical status values for lab users.
