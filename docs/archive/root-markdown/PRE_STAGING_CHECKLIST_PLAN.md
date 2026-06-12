# Pre Staging Checklist Plan

Step: 289

## Before Staging

- Run backend full tests and build.
- Run shared/lab/breeder tests and builds.
- Run deterministic Lab and Breeder E2E reset gates.
- Configure staging-only database and secrets.
- Configure explicit CORS origins.
- Verify no `.env` or artifacts are tracked.
- Verify public DTOs do not expose private fields.
- Verify rollback path keeps Bearer clients working.

## Do Not Stage Yet If

- Full quality gate is failing.
- Production or local secrets are reused.
- Public marketplace DTO tests fail.
- Cookie-mode frontend migration is incomplete and required for the staging goal.

