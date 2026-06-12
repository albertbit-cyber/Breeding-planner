# CI/CD Runtime Plan

Step: 236

## Runtime

Use GitHub Actions with:

- Ubuntu runner.
- PostgreSQL service.
- npm package installs per package.
- Backend Prisma generate, migrate deploy, and deterministic reset.
- Backend, shared, lab, and breeder unit/build validation.
- Lab and breeder deterministic Playwright E2E.

## Secrets

The initial CI workflow uses only test-only values for:

- `DATABASE_URL`
- `JWT_SECRET`
- local CORS origins
- seeded E2E passwords

No deployment secrets are needed because deployment is out of scope.
