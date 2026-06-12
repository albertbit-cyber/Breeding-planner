# Full Cross-App Live E2E Report

Date: 2026-05-20

## Command

`npm.cmd run test:e2e:live`

## Result

Timed out after 30 minutes.

## Observed Output

- Local E2E database reset passed.
- Lab E2E run printed all 19 lab tests.
- The command did not complete before the 30 minute Codex timeout.

## Important Context

Separate runs are green:

- Lab standalone E2E: 19/19 passed.
- Breeder standalone E2E: 9/9 passed.
- Backend tests: 18 files, 89 tests passed.
- Backend TypeScript build passed.

## Next Action

Stabilize `scripts/run-live-e2e.ps1` with phase logging, per-app timeouts, and child-process cleanup. After that, rerun the full root live command.

