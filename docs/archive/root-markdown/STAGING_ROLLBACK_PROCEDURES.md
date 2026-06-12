# Staging Rollback Procedures

Date: 2026-05-20

## Backend Rollback

- Keep previous backend artifact.
- Roll back if health fails, auth breaks, or core API flows fail.
- Re-run smoke tests after rollback.

## Frontend Rollback

- Keep previous frontend build artifacts.
- Roll back if UI cannot reach API, login fails, or critical workflows break.

## Prisma Migration Rollback

- Prefer forward fix migrations.
- Restore DB backup only if data integrity is compromised.
- Always back up before risky migration.

## Deployment Freeze Conditions

- Failed auth.
- Failed order workflow.
- Failed database migration.
- Unknown data loss risk.

