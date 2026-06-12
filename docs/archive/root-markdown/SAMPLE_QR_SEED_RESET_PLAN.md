# Sample QR Seed Reset Plan

## Seed Data

- Use seeded order `05AA00001`.
- Use first animal on that order.
- Build sample ID as `<orderId>-sample-1`.
- Build QR token as SHA-256 of `<orderId>:<animalId>:<sampleId>`.

## Reset

- Reset the seeded order to `submitted` before lookup/intake tests.
- Mark payment as paid through the existing helper.
- Let the UI submit intake and move the order to `in_progress`.

## Safety

- Local PostgreSQL only.
- No production database.
- No destructive reset route.

