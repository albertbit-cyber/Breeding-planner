# Hashed Refresh Session Implementation Report

## Changed Files
- `breeding-app-backend/src/services/refreshTokenSessionService.ts`
- `breeding-app-backend/src/services/authService.ts`
- `breeding-app-backend/src/tests/auth.test.ts`

## What Changed
- Added SHA-256 refresh-token hashing with `sha256:` prefix.
- Login stores hashed refresh token.
- Refresh compares incoming token to either legacy raw stored value or hashed stored value.
- Refresh rotation stores the next refresh token hashed.
- Tests assert raw refresh tokens are not stored.

## Why No New Table Yet
This keeps the change reversible and avoids unsafe schema migration while still removing raw refresh-token persistence.

