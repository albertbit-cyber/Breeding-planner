# Staging Live E2E Execution Plan

Date: 2026-05-20

## Preconditions

- Staging backend deployed.
- Staging frontends deployed.
- Staging PostgreSQL is isolated.
- Staging test data is safe to reset or test suite is adjusted to avoid destructive reset.

## Environment

```env
E2E_BACKEND_URL=<https-staging-api>
E2E_LAB_FRONTEND_URL=<https-staging-lab>
E2E_BREEDER_FRONTEND_URL=<https-staging-breeder>
```

## Execution

Use the live E2E runner only after confirming reset safety. If reset is unsafe, run staging-specific non-destructive E2E specs.

## Rollback Checkpoint

Before staging E2E:

- Backend artifact version noted.
- Frontend artifact versions noted.
- Database backup or restore point available.

