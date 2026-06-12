# Refresh Token Rotation Plan

Step: 262

## Current State

- Refresh tokens are JWTs with a 7-day expiry.
- The active refresh token is stored on the user row.
- Refresh rotates the stored token.
- Password recovery clears the stored refresh token.
- Logout now clears the stored refresh token.

## Recommended Hardening

- Replace raw refresh-token storage with hashed token storage.
- Add token family/session IDs for reuse detection.
- Add per-device/session records instead of one token per user.
- Add audit events for login, refresh, logout, password reset, and refresh reuse.
- Add refresh endpoint rate limiting.

## Compatibility Rule

Keep current single-token behavior until frontend cookie mode and deterministic E2E are fully migrated.

