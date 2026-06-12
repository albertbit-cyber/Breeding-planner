# Backend Cookie Auth Layer Report

Step: 280

## Implemented

- `requireAuth` now accepts Bearer token first, then `bp_access_token` cookie.
- Login/refresh set httpOnly access and refresh cookies.
- Refresh accepts `bp_refresh_token` cookie.
- Logout clears cookies and revokes stored refresh token.
- Cookie-mode write requests require CSRF.

## Existing Runtime Preserved

- Bearer auth is still supported.
- JSON response tokens are still returned.
- JSON refresh token body is still supported.

## Validation

- Auth tests passed.
- Backend build passed.

