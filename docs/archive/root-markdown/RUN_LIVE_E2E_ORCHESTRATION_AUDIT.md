# Run Live E2E Orchestration Audit

Date: 2026-05-20

## File Inspected

- `scripts/run-live-e2e.ps1`

## Original Flow

The original runner did three sequential actions:

1. Reset local E2E database.
2. Run lab E2E through `npm.cmd run test:e2e`.
3. Run breeder E2E through `npm.cmd run test:e2e`.

## Problems Found

- No phase start/end logging.
- No per-phase timeout.
- No clear failure phase.
- No cleanup between app suites.
- No reset between lab and breeder suites.
- The root command could hang after the lab suite without showing where the runner was blocked.

## Decision

Keep the runner small and local-only, but add deterministic phase logging, per-phase timeouts, safe E2E port cleanup, and a reset before each app suite.

