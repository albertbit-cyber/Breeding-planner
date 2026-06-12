# Rate Limiting And Abuse Protection Plan

Step: 248

## Current State

- Auth route limiter exists and is production-only to avoid blocking local E2E.
- No broad endpoint-specific limits were found for marketplace messaging, QR lookups, uploads, or public browse/search.

## Plan

Add endpoint-specific limiters:

- Auth login/register/recovery: strict per-IP and per-account limits.
- Refresh endpoint: moderate per-user/per-IP limits.
- Marketplace messaging/inquiries: per-user, per-listing, and per-recipient throttles.
- QR/sample lookup: per-IP and per-token lookup limits.
- Upload/media endpoints: per-user size/count limits.
- Admin actions: logging plus moderate throttles, not aggressive blocking.

## Abuse Signals

- repeated invalid credentials;
- high message volume;
- repeated QR misses;
- upload validation failures;
- excessive marketplace favorite toggles;
- repeated 403 ownership failures.

## E2E Safety

Keep local/test bypass or high thresholds so deterministic E2E is not weakened by throttling.
