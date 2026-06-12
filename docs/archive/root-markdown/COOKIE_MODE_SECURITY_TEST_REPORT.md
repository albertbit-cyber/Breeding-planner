# Cookie Mode Security Test Report

## Backend Tests Covered
- Login returns auth cookies and CSRF cookie.
- Refresh accepts httpOnly refresh cookie while preserving JSON refresh token support.
- `/auth/me` accepts access cookie.
- Cookie-authenticated unsafe logout requires CSRF.
- Logout succeeds with matching CSRF cookie/header.
- Refresh tokens are stored hashed instead of raw.

## Frontend Tests Covered
- Shared API client tests pass in breeder, lab, admin, marketplace, and shared packages after cookie-preferred changes.
- Bearer-only tests remain compatible because CSRF is only fetched in cookie-preferred auth mode.

## Validation Commands
- `npm.cmd test -- auth.test.ts marketplaceDto.test.ts permissionHelpers.test.ts listingService.test.ts inquiryService.test.ts orderServiceVisibility.test.ts`
- `npm.cmd test` in `breeding-app-backend`
- `npm.cmd test` in breeder, lab, admin, marketplace, shared packages

