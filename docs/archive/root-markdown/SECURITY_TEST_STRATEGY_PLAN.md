# Security Test Strategy Plan

Step: 255

## Backend Tests

- Auth token expiry, refresh rotation, logout revocation.
- Role checks for admin, lab, breeder, buyer.
- Ownership checks for listings, lab orders, conversations, saved searches, notifications.
- DTO leak tests that assert forbidden fields are absent.
- Rate limit tests using test-mode thresholds.

## Playwright Tests

- Cookie-auth migration browser flow once implemented.
- Marketplace buyer/seller separation.
- Lab and breeder deterministic E2E should remain passing.
- Admin moderation flow should verify role-gated access.

## Security Regression Cases

- Buyer cannot edit listing.
- Breeder cannot read another breeder order.
- Unauthenticated marketplace browse depends on final public policy.
- CSRF missing on cookie-auth mutation fails.
- Upload rejects invalid type/size.

## CI

Add security tests to the existing dependency CI workflow after implementation.
