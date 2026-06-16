# Staging Deployment Sequence Plan

Date: 2026-05-20

## Sequence

1. Review and commit the current runtime changes.
2. Provision isolated staging PostgreSQL.
3. Configure backend staging environment variables.
4. Deploy backend to staging.
5. Run backend health smoke.
6. Apply Prisma migrations to staging.
7. Deploy lab frontend with staging API URL.
8. Deploy breeder frontend with staging API URL.
9. Run staging smoke tests.
10. Run staging live E2E.
11. Create rollback checkpoint and production readiness review.

## Rollback

- Keep previous backend artifact available.
- Keep previous frontend artifacts available.
- Back up staging database before migrations.
- Do not reuse production database.

