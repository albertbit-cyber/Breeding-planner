# Live E2E Debug Helper Report

Date: 2026-05-20

## Current Runner

The current root runner is `scripts/run-live-e2e.ps1`.

It performs:

1. Optional local database reset.
2. Lab E2E run.
3. Breeder E2E run.

## Gap Found

The script does not currently print enough phase-level timing or enforce per-phase timeout cleanup. When the full run times out, it is hard to tell whether the next app suite started and hung, or whether Playwright/dev-server cleanup blocked completion.

## Recommended Helper Work

Add a follow-up runner patch that:

- Prints start/end timestamps for reset, lab, and breeder phases.
- Runs each phase with an explicit timeout.
- Fails fast with the phase name.
- Cleans up any lingering backend/frontend dev-server processes after each phase.

