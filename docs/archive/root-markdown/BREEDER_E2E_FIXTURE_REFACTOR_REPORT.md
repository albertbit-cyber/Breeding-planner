# Breeder E2E Fixture Refactor Report

Step: 217

## Implemented

- Breeder helper default lab password now matches the deterministic seeded lab user.
- Breeder package has `test:e2e:reset`, which runs the backend reset before Playwright.
- Existing breeder tests continue to create browser-flow orders dynamically, but those rows are removed before the next reset run.

## Remaining Mutable State

- Some breeder specs still generate result codes with `Date.now()`.
- This does not block repeatable suite runs because seeded breeder lab orders are cleared before each reset run.
