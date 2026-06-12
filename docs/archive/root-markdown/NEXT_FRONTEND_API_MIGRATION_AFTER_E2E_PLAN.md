# Next Frontend API Migration After E2E Plan

Date: 2026-05-17

## Recommended Next Slice

Migrate and verify the Lab order detail/status/payment workflow before moving into result drafting or certificates.

## Why This Slice

- Backend route tests already cover order detail, status, and payment route behavior.
- The order list E2E now proves the frontend can authenticate and read seeded backend orders.
- This is the smallest next browser-visible workflow that builds on the current E2E foundation.

## Proposed Work

1. Add a Playwright test that opens the seeded order detail from the order list.
2. Assert the detail screen uses backend data for order number, requested tests, and sample information.
3. Exercise a safe status transition against local seed data.
4. Exercise payment status display or update if the UI exposes it safely.
5. Only after passing E2E, remove any local fallback path that is no longer used by that workflow.

## Later Slices

- Result draft entry
- Result finalization
- Certificate generation
- QR/sample lookup
- Admin oversight
- Breeder-facing lab order submission and tracking
