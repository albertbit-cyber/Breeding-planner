# Cookie Auth Playwright Support Report

## Changed Files
- `breeding-app-breeder/tests/e2e/auth.setup.js`
- `breeding-app-breeder/tests/e2e/helpers.js`
- `breeding-app-lab/tests/e2e/auth.setup.ts`

## What Changed
- Playwright auth setup now captures cookies from the API request context after login.
- Storage states now include `cookie-preferred` mode in localStorage.
- Breeder page auth helper now installs `breedingPlannerBreederAuthMode = cookie-preferred`.
- Existing Bearer token storage remains for fallback and deterministic API helper flows.

## Remaining Work
- Run full Playwright browser E2E with live local backend/frontend servers.
- Add focused browser assertions for cookie-authenticated write requests once the local runtime is started.

