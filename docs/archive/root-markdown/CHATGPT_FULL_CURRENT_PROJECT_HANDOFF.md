# ChatGPT Full Current Project Handoff

Date: 2026-05-20

## Purpose

This file is a consolidated handoff for ChatGPT or another planning agent to inspect the current app state and decide the next steps. It summarizes what has been done, what is validated, what is blocked, and what should happen next.

## Repository

Workspace:

`D:\Git Clone\Breeding-planner`

The repository is a multi-app breeding/lab/marketplace system with:

- Shared backend: `breeding-app-backend`
- Breeder frontend: `breeding-app-breeder`
- Lab frontend: `breeding-app-lab`
- Marketplace/admin/shared client code in adjacent app folders
- Root legacy app files still present

## Important Safety State

- Production database was not used.
- Production deployment was not performed.
- Public deployment was not performed.
- No secrets or credentials were intentionally written into reports.
- Staging deployment was not performed because no staging PostgreSQL URL, backend host, frontend host, deployment command, or explicit deployment approval was provided.
- Local PostgreSQL was used for local deterministic E2E validation.

## High-Level Work Completed

The project has gone through staged backend, auth, lab, breeder, E2E, marketplace, security, staging, and production-readiness planning work.

Major completed areas:

- Backend API migration foundation.
- Local PostgreSQL runtime and Prisma migration support.
- Cookie-preferred auth with Bearer fallback.
- CSRF/session compatibility work.
- Refresh session/security event foundations.
- Lab order, result entry, certificate, sample QR, and breeder workflow E2E coverage.
- Deterministic local E2E reset.
- Cross-app live E2E runner.
- Marketplace DTO/public exposure hardening.
- Marketplace media/upload foundation.
- Marketplace message report and user block foundations.
- Route-level backend tests for marketplace runtime endpoints.
- Staging readiness, staging completion, production launch, beta, monitoring, and release-gate plans.

## Recent Runtime Changes

### Backend

Implemented or completed in recent phases:

- `RefreshSession` Prisma model and runtime support.
- `SecurityEvent` Prisma model and persistence.
- `MarketplaceMedia` model.
- `MarketplaceMessageReport` model.
- `MarketplaceUserBlock` model.
- Upload storage abstraction.
- Upload validation/scanning foundation.
- Marketplace media upload service and route.
- Marketplace message report service and route.
- Marketplace user block/list/unblock service and routes.
- Production-only marketplace rate limiters.
- Route-level integration tests for upload/report/block endpoints.

Key recently added backend routes:

- `POST /api/marketplace/uploads`
- `GET /api/marketplace/uploads/me`
- `POST /api/marketplace/messages/:id/report`
- `POST /api/marketplace/blocks`
- `GET /api/marketplace/blocks`
- `DELETE /api/marketplace/blocks/:blockedUserId`

### Live E2E Runner

The root live E2E runner was hardened:

- File: `scripts/run-live-e2e.ps1`
- Adds phase logging.
- Adds per-phase timeouts.
- Resets local database before lab and breeder suites.
- Cleans local E2E listener ports.
- Uses direct Playwright CLI for lab and breeder phases.

Validated command:

`npm.cmd run test:e2e:live`

Important: this runner is validated in elevated local execution mode. Sandboxed process supervision caused Playwright/dev-server hangs and is not the authoritative validation mode.

## Validation Results

Recent known good validation:

- Backend full tests: 19 files, 95 tests passed.
- Backend build: passed.
- Lab build: passed.
- Breeder build: passed.
- Full live E2E: passed in elevated local execution.
- Lab live E2E: 19/19 passed.
- Breeder live E2E: 9/9 passed.

Most recent pre-deployment live E2E:

Command:

`npm.cmd run test:e2e:live`

Result:

- Reset before lab: passed.
- Lab E2E: 19/19 passed.
- Reset before breeder: passed.
- Breeder E2E: 9/9 passed.

## Current Blockers

The app is not production-ready.

Main blockers:

1. Git worktree is heavily dirty and needs review.
2. Staging PostgreSQL is not provisioned.
3. Staging backend is not deployed.
4. Staging frontends are not deployed.
5. Staging smoke tests have not run.
6. Staging live E2E has not run against deployed staging URLs.
7. Production infrastructure is not provisioned.
8. Monitoring and alerting are planned but not implemented.
9. Legal/compliance checklist is only planned, not approved.
10. Final release gate is blocked.

## Known Warnings

Observed warnings that should be reviewed before production:

- Git warning: `unable to access 'C:\Users\alber/.config/git/ignore': Permission denied`
- Prisma `package.json#prisma` deprecation warning.
- Vite circular chunk warning.
- Breeder build warning for large `App.jsx`.
- Breeder build warning from `pdfjs-dist` use of `eval`.
- Large bundle sizes, especially breeder app.

## Dirty Git State

The worktree contains broad modified and untracked files across:

- Backend runtime code.
- Prisma schema/migrations.
- Auth/security/session files.
- Marketplace runtime/services/tests.
- Lab and breeder frontend code.
- Playwright tests/configs.
- Root app files.
- Many report and handoff markdown files.

Before any staging deployment or production launch:

1. Run a detailed `git status --short`.
2. Review untracked files.
3. Separate runtime code from reports where possible.
4. Create logical commits.
5. Do not push until explicitly approved.

## Important Handoff Files

Recommended files for the next ChatGPT inspection:

- `CHATGPT_STAGING_READINESS_HANDOFF.md`
- `CHATGPT_STAGING_EXECUTION_HANDOFF.md`
- `CHATGPT_STAGING_COMPLETION_HANDOFF.md`
- `CHATGPT_PRODUCTION_LAUNCH_HANDOFF.md`
- `FINAL_RELEASE_GATE_CHECKLIST.md`
- `FULL_PRODUCTION_READINESS_REVIEW.md`
- `DIRTY_GIT_STATE_REVIEW.md`
- `RUNTIME_COMMIT_GROUPING_PLAN.md`
- `STAGING_DEPLOYMENT_SEQUENCE_PLAN.md`
- `PRODUCTION_DEPLOYMENT_SEQUENCE_PLAN.md`

## Current Release Gate

Blocked.

Reason:

- Staging is not deployed or verified.
- Production infrastructure is not provisioned.
- Worktree is dirty.
- Monitoring/legal/release approval are not complete.

## Recommended Next Steps

1. Perform a full git review and create a clean commit plan.
2. Commit the current validated local runtime state.
3. Provision isolated staging PostgreSQL.
4. Configure staging backend secrets and environment variables.
5. Deploy backend to staging.
6. Deploy lab and breeder frontends to staging.
7. Run staging smoke tests.
8. Run staging live E2E against staging URLs.
9. Fix any staging-only runtime issues.
10. Add monitoring and alerting.
11. Re-run the release gate.
12. Only then consider production provisioning and deployment.

## Suggested Next Prompt

Use this prompt with ChatGPT:

```text
Read CHATGPT_FULL_CURRENT_PROJECT_HANDOFF.md and inspect the referenced handoff/report files.

Goal:
Create the next actionable plan to move from validated local pre-staging state to a clean staging deployment.

Constraints:
- Do not use production database.
- Do not deploy production.
- Do not expose secrets.
- Keep staging and production isolated.
- Preserve deterministic local E2E.
- Start with dirty git review and commit grouping.

Output:
1. Exact next steps.
2. Which files to inspect first.
3. What can be done locally.
4. What needs user-provided staging infrastructure.
5. Risks/blockers.
```

