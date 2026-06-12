# Breeder Order Creation Playwright Plan

## Current Feasible Plan

- Use Playwright API requests with seeded breeder token.
- Fetch breeder-visible catalog.
- Create an order with one generated test animal id and one catalog test.
- Assert 201 response and submitted status.
- Re-list breeder orders and confirm created order is visible.

## Deferred Browser Plan

- Start breeder app in Playwright.
- Log in as seeded breeder.
- Add/select animal and test from UI.
- Submit batch order.
- Assert confirmation, order appears in breeder lab panel, and label action is available.
