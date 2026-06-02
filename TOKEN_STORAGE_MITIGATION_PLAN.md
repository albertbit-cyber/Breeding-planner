# Token Storage Mitigation Plan

Date: 2026-05-17
Scope: Step 74

## Current Behavior

The split frontends store auth/session data in `localStorage` through `AuthGate.jsx` and shared API client/session helpers.

## Risk

If an XSS issue exists, JavaScript can read tokens from `localStorage`.

## Short-Term Staging Mitigation

Keep `localStorage` for staging while enforcing:

- HTTPS only
- no unsanitized HTML rendering
- strict marketplace content escaping
- host-level CSP
- short access token lifetime
- no token logging
- no token values in reports

## Long-Term Target

Move to secure httpOnly same-site cookies with CSRF protection.

## Required Future Backend Changes

- issue auth cookies on login/refresh
- clear cookies on sign out
- add CSRF token for unsafe methods
- configure CORS credentials carefully
- rotate refresh tokens

## Required Future Frontend Changes

- API client sends credentials
- stop reading tokens from localStorage
- add CSRF header/token handling
- migrate existing sessions safely

## Decision

Do not change auth storage during E2E setup. Treat cookie migration as a dedicated security hardening project.

