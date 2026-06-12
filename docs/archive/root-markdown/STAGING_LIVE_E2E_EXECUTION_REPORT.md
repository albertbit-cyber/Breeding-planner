# Staging Live E2E Execution Report

Date: 2026-05-21

## Status

Blocked. Staging live E2E was not run.

## Blockers

- staging backend not deployed
- staging lab frontend not deployed
- staging breeder frontend not deployed
- staging PostgreSQL not provisioned
- staging reset safety not confirmed
- deployment approval not granted

## Planned Environment

- `E2E_BACKEND_URL=<https-staging-api>`
- `E2E_LAB_FRONTEND_URL=<https-staging-lab>`
- `E2E_BREEDER_FRONTEND_URL=<https-staging-breeder>`

No secret values should be written to reports.

