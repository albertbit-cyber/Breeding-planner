# Staging Deployment Execution Plan

Date: 2026-05-20

## Execution Order

1. Confirm git commit and artifact versions.
2. Confirm staging secrets.
3. Back up staging database.
4. Deploy backend.
5. Run migrations.
6. Verify backend health.
7. Deploy lab frontend.
8. Deploy breeder frontend.
9. Run smoke tests.
10. Run staging live E2E.

## Checkpoints

- Before migration.
- After backend health.
- After each frontend deploy.
- After smoke tests.

## Rollback Conditions

- Migration failure.
- Health failure.
- Login/session failure.
- Core lab/breeder flow failure.

