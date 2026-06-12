# CI/CD Foundation Plan

Step: 225

## Recommended CI Order

1. Install dependencies per package.
2. Provision PostgreSQL service.
3. Create local/test `DATABASE_URL`.
4. Run backend Prisma migrate deploy.
5. Run backend seed or deterministic reset.
6. Run backend tests and build.
7. Run lab build and E2E reset suite.
8. Run breeder build and E2E reset suite.

## Required CI Secrets

- Test-only `DATABASE_URL`.
- `JWT_SECRET`.
- Local/test CORS origins.

## Do Not Run In CI Yet

- Deployment.
- GitHub release publication.
- Production migrations.

The current work prepares deterministic local E2E but does not add CI workflow files.
