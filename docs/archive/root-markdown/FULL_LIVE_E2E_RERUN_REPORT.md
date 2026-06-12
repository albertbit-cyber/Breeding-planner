# Full Live E2E Rerun Report

Date: 2026-05-20

## Command

`npm.cmd run test:e2e:live`

## Result

Passed when run outside the sandbox.

## Timing

- Reset before lab: 6 seconds.
- Lab live E2E: 1 minute 24 seconds.
- Reset before breeder: 7 seconds.
- Breeder live E2E: 1 minute 55 seconds.

## Test Counts

- Lab: 19/19 passed.
- Breeder: 9/9 passed.

## Important Finding

The same root runner timed out in the sandboxed execution context after the lab phase printed its tests. Running the command with elevated execution completed successfully.

