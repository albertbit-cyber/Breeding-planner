# Runtime Only Staging Commit Plan

Date: 2026-05-21

## Status

Plan prepared. No branch, staging, commit, push, deployment, database provisioning, or secret configuration was performed.

## Commit Order

1. Runtime ignore and shared API client safety
   - `.gitignore`
   - shared API client changes across root/admin/breeder/lab/marketplace/shared packages

2. Backend runtime security and marketplace support
   - backend package files
   - auth/session/cookie/CSRF/rate-limit changes
   - marketplace DTO/runtime/upload/security services
   - route/controller/service updates
   - backend runtime tests

3. Database migration and deterministic reset
   - Prisma schema
   - migration `20260520143000_add_refresh_sessions_security_events_and_media`
   - `breeding-app-backend/prisma/e2eReset.ts`

4. Lab frontend and lab E2E
   - lab package files
   - lab Vite/API config changes
   - lab Playwright config and E2E specs

5. Breeder frontend and breeder E2E
   - breeder package files
   - breeder App/lab workflow/family tree changes
   - duplicate component path deletions after import review
   - breeder Playwright config and E2E specs

6. Cross-app deterministic E2E and CI
   - `e2e/fixtures/deterministicFixtures.mjs`
   - `scripts/run-live-e2e.ps1`
   - `.github/workflows/dependency-ci.yml`

7. Selected reports and handoffs
   - only deployment/staging handoff files needed for reviewer context
   - keep bulk historical reports out of the runtime branch unless explicitly requested

## Keep Out

- `.claude/settings.json`
- `.vscode/settings.json`
- local logs
- local archives
- `.tools/`
- build/dist outputs
- `.env*`
- generated Playwright output and auth state

## Validation Gate

After approved commits are created, rerun:

- backend tests
- backend build
- lab build
- breeder build
- full live E2E in the validated elevated local mode

