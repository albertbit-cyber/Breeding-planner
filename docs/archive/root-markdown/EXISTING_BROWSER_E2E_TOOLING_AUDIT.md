# Existing Browser E2E Tooling Audit

Date: 2026-05-17

## Scope

Reviewed the Lab app and repository for an existing browser E2E runner before adding Playwright coverage for steps 91-104.

## Findings

- No existing Playwright or browser E2E setup was present in `breeding-app-lab` before this stage.
- `breeding-app-lab` already had Vitest unit coverage through `npm.cmd test`.
- The Lab app already had backend-aware API clients and route guards that could be exercised through a browser once a real backend and seeded local PostgreSQL database were available.
- The local backend from the previous stage exposed the needed API surface:
  - `GET /api/health`
  - `POST /api/auth/login`
  - `GET /api/lab/orders`
  - `GET /api/lab/tests/catalog`
  - `GET /api/lab/tests/pricing`

## Constraints

- The E2E runner must not commit credentials, browser storage state, traces, screenshots, or reports.
- The Lab frontend must run on a dev URL recognized by its existing API URL resolution. Port `4173` is used for E2E.
- The backend `.env` remains local-only and is not copied into tracked files.

## Result

Browser E2E tooling was safe to add inside `breeding-app-lab` without changing production runtime code.
