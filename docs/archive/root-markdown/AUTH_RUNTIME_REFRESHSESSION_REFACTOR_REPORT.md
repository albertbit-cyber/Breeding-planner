# Auth Runtime RefreshSession Refactor Report

## Changed Files
- `breeding-app-backend/src/services/authService.ts`
- `breeding-app-backend/src/services/refreshTokenSessionService.ts`
- `breeding-app-backend/src/tests/auth.test.ts`
- `breeding-app-backend/src/tests/refreshTokenSessionService.test.ts`

## What Changed
- Login creates a `RefreshSession` record when the model is available.
- Refresh looks for an active refresh session by hashed token.
- Refresh rotates the session and revokes the previous session.
- Logout revokes active refresh sessions for the user.
- Existing hashed `User.refreshToken` remains as fallback.

## Validation
- Targeted backend security tests passed.
- Full backend tests passed.

