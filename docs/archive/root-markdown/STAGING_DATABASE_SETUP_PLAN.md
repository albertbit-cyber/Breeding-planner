# Staging Database Setup Plan

Date: 2026-05-20

## Sequence

1. Provision isolated PostgreSQL staging database.
2. Create dedicated staging database user.
3. Set `DATABASE_URL` in backend staging secret store.
4. Verify URL is not production.
5. Run Prisma migration deploy against staging.
6. Seed only safe staging data if required.
7. Run backend health check.

## Safety

Do not run deterministic E2E reset against any database that contains real user data.

## Status

Prepared only. No staging database URL was provided.

