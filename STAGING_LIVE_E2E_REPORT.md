# Staging Live E2E Report

Date: 2026-05-20

## Status

Not executed against staging.

## Reason

No staging backend URL, lab URL, or breeder URL was provided.

## Required Command Shape

After staging deployment, set:

```env
E2E_BACKEND_URL=<https-staging-api>
E2E_LAB_FRONTEND_URL=<https-lab-staging>
E2E_BREEDER_FRONTEND_URL=<https-breeder-staging>
```

Then run the live E2E runner against staging only if the reset behavior is safe for the staging database.

## Warning

Do not run deterministic reset against any database with real user/customer data.

