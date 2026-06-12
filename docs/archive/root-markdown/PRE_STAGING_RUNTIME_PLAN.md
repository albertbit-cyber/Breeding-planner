# Pre Staging Runtime Plan

## Required Before Staging
- Confirm `.env` separation for local, staging, and production.
- Use staging-only PostgreSQL; never point staging at production.
- Set strong JWT and cookie secrets.
- Set explicit CORS origins for each hosted frontend.
- Enable `NODE_ENV=production` to activate rate limiters.
- Run Prisma migrations against staging only after backup/rollback plan exists.
- Run deterministic seed/reset only against local or isolated staging test database.

## Validation Checklist
- Backend health endpoint.
- Auth login, refresh, logout, CSRF.
- Marketplace public listing browsing.
- Authenticated listing mutation.
- Lab order flow.
- Breeder order/certificate flow.
- Upload runtime remains disabled until implemented.

