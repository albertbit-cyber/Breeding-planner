# Security Runtime Review

Step: 288

## Current Runtime Improvements

- Backend supports Bearer and cookie authentication.
- Cookie writes require CSRF.
- Auth refresh can use cookie or JSON body.
- Public marketplace browse/detail/store are backed by allowlisted DTOs.
- Auth write/recovery/refresh production rate limiters exist.
- Permission helpers are available and covered by tests.

## Remaining Runtime Risks

- Refresh tokens are not hashed at rest.
- Frontends still primarily use localStorage Bearer flow.
- Central security event logging is not implemented.
- Marketplace upload/message/QR limiters are still planned.

