# Refresh Token Session Table Plan

## Current State
The backend still has one `User.refreshToken` column. This phase moved the stored value from raw token to a SHA-256 prefixed hash while accepting legacy raw stored tokens during migration.

## Target Session Model
Add a dedicated refresh-session table with:
- `id`
- `userId`
- `tokenHash`
- `deviceName`
- `ipHash`
- `userAgent`
- `createdAt`
- `lastUsedAt`
- `expiresAt`
- `revokedAt`
- `replacedBySessionId`

## Required Behavior
- Rotate refresh token and session row on every refresh.
- Revoke reused or mismatched sessions.
- Support logout of current session and logout of all sessions.
- Keep deterministic E2E seed/reset aware of the table.

## Next Step
Create a Prisma migration only after local database migration safety is confirmed.

