# Shared API Config Backend Status Cleanup Report

Date: 2026-05-17
Scope: Step 72

## Result

No shared import replacement was performed in this pass.

## Reason

Step 71 recommends deciding the dependency strategy first. The split apps currently build with local copies, and broad import changes before E2E runtime would add avoidable risk.

## Recommended First App

Use `breeding-app-admin` as the first cleanup target.

Why:

- small app surface
- only two shared API/config tests
- lower risk than breeder/lab

## Candidate Helpers

- `src/shared/config/api.ts`
- `src/shared/backendStatus.ts`

## Acceptance Criteria For Future Cleanup

- app depends on `breeding-app-shared`
- imports are replaced in one app only
- app build passes
- app tests pass
- no behavior change in API URL validation

