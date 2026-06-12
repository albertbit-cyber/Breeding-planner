# Security Fixes Needed

Date: 2026-05-16
Scope: Deployment-blocking or deployment-relevant security findings from Step 28.

## Before Deployment

1. Require explicit production CORS origins.
   - Current behavior in `breeding-app-backend/src/app.ts` allows any origin in production when `CORS_ORIGIN` is empty.
   - Recommended behavior: fail closed in production if no allowed origins are configured.

2. Verify standalone `.gitignore` files before publishing.
   - Added on 2026-05-16 in: `breeding-app-admin`, `breeding-app-backend`, `breeding-app-breeder`, `breeding-app-lab`, `breeding-app-marketplace`, `breeding-app-shared`.
   - They now ignore at least `.env`, `.env.*`, `node_modules`, build outputs, logs, and coverage.
   - The Git index still needs review because generated artifacts appear to have been staged before these ignore files existed.

3. Confirm marketplace public response fields.
   - Public marketplace responses include IDs such as listing IDs and seller user IDs, plus public profile/store fields.
   - Confirm whether `sellerUserId`, `ownerId`, `rowId`, and any profile-derived contact fields are intended to be public.

4. Replace local/dev secrets in deployment environments.
   - `server/.env` contains a local Postgres URL and `dev-only-change-this-secret`; it is ignored but must not be reused in hosted environments.
   - Use a strong unique `JWT_SECRET` per environment.

5. Review token storage before production hardening.
   - Frontend API clients store auth data in `localStorage`.
   - Minimum mitigation: maintain strict XSS hygiene, avoid rendering unsanitized HTML, and set strong headers/CSP at the hosting layer.
   - Better long-term option: httpOnly secure same-site cookies with CSRF protection.

## Recommended Hardening

- Add schema validation for non-auth write routes, especially marketplace, listing, lab order, profile, inquiry, notification, and subscription endpoints.
- Add authorization regression tests for admin-only, lab-only, owner-only, and public marketplace paths.
- Ensure production `DATABASE_URL` uses least-privileged credentials where possible.
- Confirm logs do not include bearer tokens, passwords, or full request bodies.
- Configure hosting to serve frontends over HTTPS only.
