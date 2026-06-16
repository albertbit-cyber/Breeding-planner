# SecurityEvent Runtime DB Report

## Changed Files
- `breeding-app-backend/src/services/securityEventService.ts`
- `breeding-app-backend/src/services/authService.ts`

## What Changed
- Security events now persist to `securityEvent.create` when available.
- Existing `adminAuditLog` fallback remains for compatibility.
- Persistence is best effort and will not fail the user request if logging fails.

## Events Wired
- Login success
- Refresh success
- Refresh revoked/reused mismatch
- Logout
- Password recovery success

