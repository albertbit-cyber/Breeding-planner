# Staging Smoke Validation Plan

Date: 2026-05-20

## Must Pass

- Backend health.
- Login and session refresh.
- Logout.
- Lab order list/detail/status/result/certificate.
- Breeder order creation/status/certificate/labels.
- Marketplace upload route.
- Marketplace report route.
- Marketplace block/list/unblock routes.

## Blocker Conditions

- Auth unavailable.
- Database unavailable.
- Order workflows blocked.
- Upload storage write failure.
- Permission boundary failure.

## Rollback Triggers

- Backend health failure.
- Login/session regression.
- Lab or breeder core flow blocked.
- Unexpected 5xx in critical routes.

