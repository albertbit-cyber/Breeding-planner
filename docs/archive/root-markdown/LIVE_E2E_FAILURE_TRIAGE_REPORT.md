# Live E2E Failure Triage Report

Date: 2026-05-20

## Scope

Step 329 reviewed the live E2E failure pattern from the previous pre-staging run and this batch.

## Findings

- Backend unit tests and backend build are not the blocker.
- `breeding-app-lab` passed when run as a standalone live suite: 19/19.
- `breeding-app-breeder` passed when run as a standalone live suite: 9/9.
- The full root live command still timed out after 30 minutes:
  - Command: `npm.cmd run test:e2e:live`
  - It reset local Postgres successfully.
  - It ran the lab suite and printed all 19 lab tests.
  - It did not complete the full cross-app script before the Codex command timeout.

## Interpretation

The live failure is now a cross-app runner orchestration issue, not an isolated lab or breeder E2E defect. The next fix should make `scripts/run-live-e2e.ps1` enforce per-app timeouts, print explicit phase boundaries, and clean up child dev-server processes between app suites.

