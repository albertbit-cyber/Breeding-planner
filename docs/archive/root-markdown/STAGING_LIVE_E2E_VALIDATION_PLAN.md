# Staging Live E2E Validation Plan

Date: 2026-05-20

## Preconditions

- Staging backend deployed.
- Staging frontends deployed.
- Test data reset strategy approved.
- E2E URLs configured.

## Environment

```env
E2E_BACKEND_URL=<https-staging-api>
E2E_LAB_FRONTEND_URL=<https-staging-lab>
E2E_BREEDER_FRONTEND_URL=<https-staging-breeder>
```

## Strategy

- Use non-production data only.
- Do not run reset against real customer data.
- Capture traces/videos/screenshots on failure.
- Use per-phase timeouts from the live runner.

## Failure Escalation

- Stop deployment.
- Preserve artifacts.
- Identify failed phase.
- Fix or roll back before continuing.

