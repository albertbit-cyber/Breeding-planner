# Current Seed Reset Strategy Audit

Step: 212

## Current State

- Backend seed lives in `breeding-app-backend/prisma/seed.ts`.
- Existing seed creates stable admin, lab, breeder, and buyer users, catalog data, pricing data, marketplace sample data, lab account data, and admin-review samples.
- Existing Playwright suites depend on seeded users and a stable lab order number, `05AA00001`.
- Before this stage, there was no dedicated deterministic E2E reset command that recreated the expected lab order from scratch.

## Risks Found

- Several E2E specs create lab orders dynamically, so repeated runs can pollute the local database.
- Lab and breeder Playwright suites shared local backend state but did not have a single reset entry point.
- Some tests still use `Date.now()` for result codes or temporary animal IDs. This is acceptable after a suite-level reset, but not ideal for fully reproducible fixture naming.

## Decision

Use a local-only reset command that:

- refuses non-local PostgreSQL URLs,
- requires `E2E_RESET_CONFIRM=local`,
- recreates deterministic E2E users,
- clears lab orders owned by the seeded breeder only,
- recreates stable order `05AA00001`.
