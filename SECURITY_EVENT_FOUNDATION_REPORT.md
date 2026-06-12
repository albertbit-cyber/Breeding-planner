# Security Event Foundation Report

## Changed Files
- `breeding-app-backend/src/services/securityEventService.ts`
- `breeding-app-backend/src/services/authService.ts`

## What Changed
- Added `recordSecurityEvent`.
- Sanitizes metadata recursively for password/token/secret/cookie/authorization keys.
- Uses `securityEvent.create` when a future Prisma model exists.
- Falls back to `adminAuditLog.create` only when available and an actor is present.
- Logging is best-effort and does not fail the request path.

## Events Wired
- Login success
- Refresh success
- Refresh revoked/reuse mismatch
- Logout
- Password recovery success

