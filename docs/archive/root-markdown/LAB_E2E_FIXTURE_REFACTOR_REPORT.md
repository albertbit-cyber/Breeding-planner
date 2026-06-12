# Lab E2E Fixture Refactor Report

Step: 220

## Implemented

- Lab helper default password now matches deterministic seed data.
- Lab package has `test:e2e:reset`, which runs backend reset first.
- Existing lab tests continue to use `expectedOrderNumber` defaulting to `05AA00001`.

## Remaining Mutable State

- Lab result-entry and certificate tests still use timestamped result codes.
- Lab breeder-workflow test creates a timestamped animal ID.
- These are cleaned by the reset because all seeded breeder lab orders are removed and recreated.
