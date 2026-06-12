# RefreshSession Security Test Report

## Tests Added/Updated
- Added `refreshTokenSessionService.test.ts`.
- Updated `auth.test.ts` to assert refresh sessions are created, rotated, and revoked.

## Coverage
- Refresh token hashing uses `sha256:` prefix.
- Raw refresh tokens are not stored.
- Active sessions are looked up by hashed token.
- Rotation revokes the previous session and links to the replacement.
- Logout revokes active user sessions.

## Validation
Backend tests passed: 17 files, 85 tests.

