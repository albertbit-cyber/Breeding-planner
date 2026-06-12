# Result Entry Workflow Audit

Date: 2026-05-17

## Current Flow

- Lab order detail embeds `InlineResultEntry` when order status is `received` or `in_progress`.
- Result Entry page also supports selecting an eligible order and entering results.
- Template loading uses `getLabResultEntryTemplate(orderId)`.
- Draft save calls `POST /api/lab/orders/:id/results/draft`.
- Final submit calls `POST /api/lab/orders/:id/results/submit`.
- Draft moves `received` orders to `in_progress`.
- Submit moves orders to `completed` and creates certificate-ready completed results.

## Backend Contract

- Existing controller routes were present before this stage.
- `saveOrderResult` validates lab/admin access, order state, test code, animal membership, ordered test keys, and allowed result statuses.
- Draft can persist partial rows.
- Submit must include every ordered test for every ordered animal.

## Local E2E Assumptions

- Local PostgreSQL only.
- Seeded lab order number: `05AA00001`.
- Seeded lab login comes from local E2E environment variables.
- Playwright auth storage is created by API login before browser tests.

## Risks

- The shared result template still coexists with local fallback result handlers.
- Completed result display formats internal test codes into lab display numbers, so E2E assertions should rely on API response plus visible summary/status.
- Dependency audit has known findings that were not force-fixed in this stage.

