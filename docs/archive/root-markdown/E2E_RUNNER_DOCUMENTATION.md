# E2E Runner Documentation

Date: 2026-05-17

## Location

The Playwright runner lives in `breeding-app-lab`.

## One-Time Setup

From `breeding-app-lab`:

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

The backend must have a valid local `.env` and local PostgreSQL database from the previous database E2E stage.

## Environment

Copy `breeding-app-lab/.env.e2e.example` to a local ignored file or export equivalent environment variables:

- `E2E_BACKEND_URL`
- `E2E_LAB_FRONTEND_URL`
- `E2E_LAB_EMAIL`
- `E2E_LAB_PASSWORD`
- `E2E_EXPECTED_ORDER_NUMBER`

Do not commit the local file or real password.

## Run

From `breeding-app-lab`:

```powershell
npm.cmd run test:e2e
```

For debugging:

```powershell
npm.cmd run test:e2e:ui
```

## Behavior

- Playwright starts or reuses the backend on `http://127.0.0.1:4000`.
- Playwright starts or reuses the Lab frontend on `http://127.0.0.1:4173`.
- The setup project writes authenticated state to `playwright/.auth/lab.json`.
- Traces, videos, screenshots, reports, and auth state are git-ignored.

## Current Passing Tests

- Backend health
- Lab frontend load
- Seeded lab UI login
- Catalog/pricing backend calls
- Seeded lab order list
