# Deployment Dirty Worktree Review

Date: 2026-05-21

## Scope

Reviewed the dirty worktree for steps 436-455 using:

- `CHATGPT_DEPLOYMENT_READINESS_HANDOFF.md`
- `CHATGPT_STAGING_TRANSITION_HANDOFF.md`
- `CHATGPT_STAGING_EXECUTION_HANDOFF.md`
- `git status --porcelain=v1 -uall`
- `git diff --stat`
- `git diff --name-status`

No production database, production deployment, secrets, or `.env` contents were used.

## Current Branch

- Current branch: `all-branches-merged`
- Deployment branch: not created yet, because the execution prompts require approval before branch creation, commits, or deployment.

## Deployment Branch Candidates

Runtime code and config candidates:

- `.gitignore`
- `.github/workflows/dependency-ci.yml`
- `package.json`
- Backend package files, Prisma schema, migration, reset helper, source, middleware, services, routes, tests, and cookie/auth utilities under `breeding-app-backend/`
- Lab package files, Playwright config, shared API client, lab API client, and E2E specs under `breeding-app-lab/`
- Breeder package files, Playwright config, app source, lab workflow components, family tree feature, shared API client/config, and E2E specs under `breeding-app-breeder/`
- Shared API clients under `breeding-app-admin/`, `breeding-app-marketplace/`, `breeding-app-shared/`, and root `src/shared/`
- Root app changes under `src/App.jsx` and `src/App.css`, pending manual review because prior plans flagged root legacy UI as review-sensitive
- Cross-app deterministic E2E assets under `e2e/`
- `scripts/run-live-e2e.ps1`

## Separate Commit Candidates

Database/migration candidates:

- `breeding-app-backend/prisma/schema.prisma`
- `breeding-app-backend/prisma/migrations/20260520143000_add_refresh_sessions_security_events_and_media/migration.sql`
- `breeding-app-backend/prisma/e2eReset.ts`

E2E/CI candidates:

- `.github/workflows/dependency-ci.yml`
- `breeding-app-lab/playwright.config.ts`
- `breeding-app-lab/tests/e2e/**`
- `breeding-app-breeder/playwright.config.mjs`
- `breeding-app-breeder/tests/e2e/**`
- `e2e/fixtures/deterministicFixtures.mjs`
- `scripts/run-live-e2e.ps1`

Report/handoff candidates:

- `*_REPORT.md`
- `*_PLAN.md`
- `CHATGPT_*HANDOFF.md`
- staging checklist and operational Markdown files

## Exclude From Deployment Branch

Local-only or generated files that must not be staged:

- `.env`
- `.env.local`
- `.codex-*.log`
- `.tools/`
- root `build/`
- root `dist/`
- `Breeding-planner-project.zip`
- `node-v22.11.0-win-x64.zip`
- Playwright output/auth directories already covered by the pending `.gitignore` update

## Manual Review Required

- `.claude/settings.json` contains local tool allowlist changes and should stay out of runtime deployment unless intentionally versioned.
- `.vscode/settings.json` contains only `{}` and should stay out of runtime deployment unless the team wants editor settings committed.
- Deleted duplicate breeder component paths under `breeding-app-breeder/src/features/lab/components/components/` need review with import checks before staging.

## Decision

The deployment branch should contain runtime code, migration files, deterministic E2E/CI files, and a small selected set of handoff reports only after approval. Generated artifacts, local logs, local env files, tool downloads, local SDKs, and editor/agent-local settings should be excluded.

