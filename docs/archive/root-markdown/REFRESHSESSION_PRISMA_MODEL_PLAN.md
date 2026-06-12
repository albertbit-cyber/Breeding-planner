# RefreshSession Prisma Model Plan

## Goal
Move refresh-token state out of `User.refreshToken` and into a dedicated session table that supports rotation, revocation, reuse detection, and future device/session management.

## Model Added
- `RefreshSession`
- Mapped table: `refresh_sessions`
- Stores only `tokenHash`, never raw refresh tokens.

## Important Fields
- `userId`
- `tokenHash`
- `deviceName`
- `ipHash`
- `userAgent`
- `expiresAt`
- `revokedAt`
- `replacedBySessionId`
- `lastUsedAt`

## Compatibility
The existing `User.refreshToken` hash is kept as a temporary migration fallback so older active sessions do not break during the transition.

