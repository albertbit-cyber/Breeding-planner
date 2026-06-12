# E2E Environment Template Report

Date: 2026-05-17

## Changes

Added `breeding-app-lab/.env.e2e.example` with local-only E2E settings:

- `E2E_BACKEND_URL=http://127.0.0.1:4000`
- `E2E_LAB_FRONTEND_URL=http://127.0.0.1:4173`
- `E2E_LAB_EMAIL=lab@proherper.dev`
- `E2E_LAB_PASSWORD=replace-with-local-seeded-password`
- `E2E_EXPECTED_ORDER_NUMBER=05AA00001`

## Security

- The example file does not contain real secrets.
- Local E2E runtime credentials are passed through environment variables.
- Playwright authenticated state is written to `breeding-app-lab/playwright/.auth/lab.json`, which is ignored by git.

## Ignore Rules Added

- `/breeding-app-lab/.env.e2e.local`
- `/breeding-app-lab/playwright/.auth`
- `/breeding-app-lab/playwright-report`
- `/breeding-app-lab/test-results`
