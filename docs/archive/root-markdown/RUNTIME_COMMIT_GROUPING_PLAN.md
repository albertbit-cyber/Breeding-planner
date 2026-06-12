# Runtime Commit Grouping Plan

Date: 2026-05-20

## Recommended Groups

1. Backend auth/session/security runtime.
2. Prisma schema, migrations, seed/reset tooling.
3. Marketplace DTO/media/moderation/upload runtime.
4. Lab API migration and Playwright E2E.
5. Breeder API migration and Playwright E2E.
6. Live E2E runner and cross-app deterministic reset.
7. CI/dependency/security reports.
8. ChatGPT handoffs and planning reports.

## Rule

Commit deployable runtime code separately from planning/report artifacts when possible.

## Blocker

The current worktree is broad enough that a manual staged review is required before any commit or push.

