# Result E2E Seed And Reset Plan

## Seed Data

- Use seeded local PostgreSQL lab order `05AA00001`.
- Use seeded lab user credentials supplied through local E2E environment variables.

## Reset Strategy

- Do not delete shared data.
- Find the seeded order by order number.
- Patch order status to `received` for draft tests.
- Patch order status to `in_progress` for submit tests.
- Patch payment to `paid`.
- Use a unique test code per test run to avoid collisions with prior result rows.

## Safety

- Local PostgreSQL only.
- No production database.
- No `.env` committed.
- No destructive reset route added.

