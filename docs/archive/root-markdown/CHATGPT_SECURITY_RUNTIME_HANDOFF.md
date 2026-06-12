# ChatGPT Security Runtime Handoff

Step: 291

## Summary

Steps after 259 through 291 were completed locally as a security implementation/runtime phase. No production database, deployment, or push was performed. Existing dirty worktree changes unrelated to this phase were not reverted.

## Implemented Code

- Dual-mode backend auth foundation:
  - Bearer auth remains supported.
  - Cookie auth is added through `bp_access_token` and `bp_refresh_token`.
  - Login and refresh set cookies while still returning JSON tokens.
  - Refresh accepts JSON body token or refresh cookie.
  - Logout clears cookies and revokes the stored refresh token.
- CSRF foundation:
  - `bp_csrf_token` readable cookie.
  - `GET /api/auth/csrf-token`.
  - Cookie-authenticated unsafe requests require matching `x-csrf-token`.
  - Bearer clients are not blocked.
- Auth abuse throttling:
  - Production login/register limiter.
  - Production password recovery limiter.
  - Production refresh limiter.
- Marketplace safe DTO allowlists:
  - Centralized DTO module.
  - Removed unsafe legacy `payload` spreading.
  - Public marketplace browse/detail/store use safe DTOs.
- Permission helpers:
  - Central admin/lab/seller/owner-or-admin helpers.
  - Marketplace owner edit/status paths use centralized helper.

## New Important Files

- `breeding-app-backend/src/utils/authCookies.ts`
- `breeding-app-backend/src/middleware/csrf.ts`
- `breeding-app-backend/src/middleware/rateLimiters.ts`
- `breeding-app-backend/src/services/permissionHelpers.ts`
- `breeding-app-backend/src/services/marketplaceDtos.ts`
- `breeding-app-backend/src/tests/marketplaceDto.test.ts`
- `breeding-app-backend/src/tests/permissionHelpers.test.ts`

## Validation

- Targeted security tests passed: 6 files, 43 tests.
- Full backend test suite passed: 14 files, 79 tests.
- `npm.cmd run build`
- Result: passed.

## Remaining Work

- Frontend apps still primarily use localStorage/Bearer tokens.
- Refresh tokens are still stored raw and should be hashed with session records.
- Central security event logging is still planned.
- Marketplace messaging, upload, QR, and listing mutation rate limiters are still planned.
- Backend-owned media upload/storage is still planned.
- Playwright security tests should be added after frontend cookie-mode migration.

## Recommended Next Steps

1. Migrate frontend API clients to cookie-preferred auth while preserving Bearer fallback.
2. Add hashed refresh-token session table and reuse detection.
3. Add central security-event/audit service.
4. Implement marketplace messaging/reporting/blocking moderation tools.
5. Implement backend-owned media storage and upload validation.
6. Run full local quality gate before staging preparation.
