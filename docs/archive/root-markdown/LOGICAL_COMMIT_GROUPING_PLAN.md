# Logical Commit Grouping Plan

Date: 2026-05-20

## Suggested Commit Order

1. Backend auth/session/security foundation.
2. Backend marketplace/media/moderation runtime.
3. Prisma migrations and deterministic reset.
4. Lab app API/E2E migration.
5. Breeder app API/E2E migration.
6. Cross-app live E2E runner and configs.
7. CI/dependency updates.
8. Reports and handoff artifacts.

## Current Decision

No commit was created automatically. The worktree is too broad to safely stage without manual approval and review.

