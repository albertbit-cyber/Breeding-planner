# Deterministic Breeder Fixtures Plan

Step: 215

## Plan

Use the seeded breeder account as the stable owner for browser and API E2E workflows.

## Fixtures

- Breeder user: `breeder@proherper.dev`.
- Password: seeded local password from reset.
- Primary snake visible in breeder E2E: `25Ath-1`, `Athena - DEMO`.
- Baseline owned lab order: `05AA00001`.

## Scope

The reset clears lab orders for the seeded breeder and recreates the baseline order. It does not remove unrelated local users or non-seeded breeder data.
