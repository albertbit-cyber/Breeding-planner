# Security Hardening Phase Plan

Step: 241

## Scope

Plan a separate security hardening phase after dependency/CI stabilization.

## Recommended Work Items

1. Auth/session hardening:
   - Move browser auth from localStorage toward httpOnly cookies.
   - Add refresh-token rotation and revoke-on-logout behavior.
2. CSRF protection:
   - Add CSRF strategy before cookie auth is enabled.
3. Permission enforcement:
   - Review role checks on lab, breeder, marketplace, admin, and public endpoints.
4. DTO safety:
   - Ensure API responses do not leak internal fields, tokens, hashes, or private notes.
5. Upload validation:
   - Restrict file types, sizes, and storage paths for animal photos and lab artifacts.
6. Rate limiting:
   - Keep production auth limiter enabled.
   - Add endpoint-specific limits for sensitive routes.
7. Audit logging:
   - Log admin actions, lab result changes, payment/status updates, and auth events.
8. Secrets handling:
   - Document required env vars.
   - Add CI checks that `.env` files are not committed.

## Do Not Include

- No production deployment in this phase.
- No forced dependency upgrade without a migration plan.
