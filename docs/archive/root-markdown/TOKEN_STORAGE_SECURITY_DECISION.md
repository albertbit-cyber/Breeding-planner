# Token Storage Security Decision

Date: 2026-05-16
Scope: Step 56.

## Current State

Frontend auth sessions are stored in `localStorage` by `AuthGate.jsx` in the split apps.

Stored session data can include:

- access token
- refresh token
- user object
- app scope/session metadata

## Risk

`localStorage` is readable by JavaScript. If an XSS vulnerability is introduced, tokens can be stolen.

## Short-Term Decision

Keep `localStorage` for local/staging deployment while enforcing:

- strict no-unsanitized-HTML policy
- no rendering untrusted marketplace HTML
- HTTPS only
- strong CSP at host layer
- short access token lifetime
- refresh token rotation if possible

Reason:

- Switching to httpOnly cookies requires backend and frontend auth flow changes.
- Current goal is finishing API migration and deployment preparation without destabilizing auth.

## Long-Term Decision

Move auth to secure httpOnly same-site cookies with CSRF protection.

Required work:

- backend cookie issuing/clearing endpoints
- CSRF token strategy for unsafe methods
- frontend API client credential mode
- migration path for existing localStorage sessions
- test coverage for CORS/cookie behavior

## Do Not Do Now

- Do not change token storage in this pass.
- Do not deploy production without CSP/XSS review if localStorage remains.

