# Pre-Staging Full Quality Gate Report

Date: 2026-05-20

## Passed

- Backend targeted marketplace runtime tests: 4/4 passed.
- Backend full test suite: 18 files, 89 tests passed.
- Backend TypeScript build passed.
- Local E2E reset passed against `breeding_planner_local`.
- Lab standalone live E2E passed: 19/19.
- Breeder standalone live E2E passed: 9/9.

## Blocked

- Full root cross-app live E2E command timed out after 30 minutes:
  - `npm.cmd run test:e2e:live`

## Deployment Readiness Impact

The app is not ready for staging promotion until the full root live runner can complete reliably. The isolated app gates are green, so the next work should target runner orchestration rather than feature workflow code.

