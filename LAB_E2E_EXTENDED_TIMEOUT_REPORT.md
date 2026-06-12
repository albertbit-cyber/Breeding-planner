# Lab E2E Extended Timeout Report

Date: 2026-05-20

## Command

`npm.cmd run test:e2e` in `breeding-app-lab`

## Result

Passed.

- Test files: lab Playwright suite
- Tests: 19/19 passed
- Runtime: about 1.4 minutes in the standalone run

## Notes

The standalone lab result confirms the previous lab failures were not persistent app failures. The full root live script still needs runner-level stabilization because it can time out after the lab phase.

