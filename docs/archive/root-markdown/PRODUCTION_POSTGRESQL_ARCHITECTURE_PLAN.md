# Production PostgreSQL Architecture Plan

Date: 2026-05-20

## Recommended Architecture

- Managed PostgreSQL with automated backups.
- Private networking where supported.
- Dedicated production database user with least privilege.
- Separate migration/admin credential if the hosting provider supports it.
- Point-in-time recovery enabled.
- Connection pooling if frontend traffic grows.

## Migration Rules

1. Apply migrations to staging first.
2. Run staging smoke and live E2E.
3. Back up production before production migration.
4. Apply production migrations during a low-traffic window.
5. Verify `/api/health` and critical auth/order flows immediately after migration.

## Prohibited

- No production E2E reset.
- No local seed scripts against production.
- No production credentials in repo or handoff files.

