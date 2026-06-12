
# Seeded Login Playwright Report

Date: 2026-05-17

## Tests Added

- `breeding-app-lab/tests/e2e/auth.setup.ts`
- `breeding-app-lab/tests/e2e/seeded-login.spec.ts`

## What They Verify

- The local seeded lab user can authenticate against the backend.
- Authenticated browser state can be created for the rest of the E2E suite.
- The UI login path still works without preloaded storage state.

## Security

- No password was committed.
- The setup test reads credentials from environment variables.
- The generated storage state is ignored by git.

## Current Result

Passed in the latest E2E run.
