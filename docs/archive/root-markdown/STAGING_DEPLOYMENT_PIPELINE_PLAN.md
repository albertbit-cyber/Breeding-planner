# Staging Deployment Pipeline Plan

## Pipeline Shape
1. Install dependencies from lockfiles.
2. Generate Prisma client.
3. Run backend tests and build.
4. Run frontend package tests and builds.
5. Apply migrations to staging database.
6. Deploy backend with staging env.
7. Deploy frontends with staging API URL.
8. Run smoke tests and selected Playwright E2E against staging.

## Boundaries
- No production database access.
- No production secrets in CI.
- No public deploy from this phase.
- Rollback requires previous backend artifact and database backup.

## Recommended Next Step
Create staging environment templates and CI jobs that run without deploy first.

