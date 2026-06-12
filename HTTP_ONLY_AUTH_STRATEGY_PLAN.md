# HTTP Only Auth Strategy Plan

Step: 245

## Goal

Move browser auth from localStorage Bearer tokens toward httpOnly secure cookies while preserving deterministic E2E and mobile/API compatibility.

## Proposed Phases

1. Add dual-mode auth support:
   - keep Bearer token support for mobile and migration;
   - add cookie access-token/refresh-token support for browser clients.
2. Add cookie-setting endpoints:
   - login sets httpOnly refresh cookie and short-lived access cookie;
   - refresh rotates refresh cookie;
   - logout clears cookies and revokes DB refresh token.
3. Add frontend migration:
   - browser requests use `credentials: include`;
   - remove localStorage token dependence only after E2E coverage passes.
4. Add monitoring and rollback:
   - keep Bearer mode behind a compatibility flag until all apps migrate.

## Cookie Requirements

- `httpOnly: true`
- `secure: true` in production
- `sameSite: "lax"` or `"strict"` based on final cross-site deployment shape
- narrow path scoping where practical

## Open Decisions

- Whether access token should be cookie-backed or held in memory while refresh stays httpOnly.
- Whether native/mobile clients continue Bearer-only long term.
