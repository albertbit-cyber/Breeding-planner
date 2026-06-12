# CSRF And Session Protection Plan

Step: 247

## Requirement

CSRF protection is required before enabling cookie-based browser auth.

## Proposed Strategy

- Use SameSite cookies as the first protection layer.
- Add a CSRF token for state-changing browser requests:
  - `GET /api/auth/csrf` returns a non-secret token readable by JS;
  - client sends it in `X-CSRF-Token`;
  - backend validates token against signed cookie/session state.
- Apply CSRF validation to POST, PUT, PATCH, DELETE for cookie-authenticated browser requests.
- Bearer-token API/mobile requests can bypass CSRF because the token is not automatically attached by the browser.

## Session Hardening

- Rotate refresh token on every refresh.
- Revoke refresh token on logout, password reset, account disable, and role change.
- Store refresh token hashes instead of raw refresh tokens in the database.
- Track `lastLoginAt`, `lastRefreshAt`, and `sessionRevokedAt`.

## Tests

- Missing CSRF on cookie-auth POST returns 403.
- Bearer-token API request still works.
- Logout invalidates refresh token.
- Old refresh token is rejected after rotation.
