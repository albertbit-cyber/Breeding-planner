# Live Server E2E Runtime Report

## Added
- `scripts/run-live-e2e.ps1`
- Root package scripts:
  - `test:e2e:live`
  - `test:e2e:live:no-reset`

## Attempted Run
Command:
- `npm.cmd run test:e2e:live:no-reset`

## Result
The command timed out after 10 minutes before breeder E2E started.

## Partial Lab Result Observed Before Timeout
- Lab setup and several API/browser tests passed.
- Several lab browser tests were marked failing/retrying around certificate, result entry, and sample QR workflows.

## Next Action
Run lab E2E separately with a longer timeout and inspect Playwright traces for the failing specs before using this as a staging gate.

