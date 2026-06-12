# Security Playwright Test Plan

Step: 270

## Recommended Tests

- Browser login still works in Bearer/localStorage mode.
- Cookie mode can fetch CSRF and perform protected writes.
- Public marketplace browse does not expose private fields.
- Breeder cannot open another breeder's lab order.
- Buyer cannot update breeder inquiry follow-up.
- Admin-only pages reject breeder sessions.

## Status

Backend security tests were added in this phase. Playwright security tests should follow after frontend cookie-mode migration.

