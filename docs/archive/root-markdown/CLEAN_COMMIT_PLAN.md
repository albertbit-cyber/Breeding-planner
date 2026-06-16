# Clean Commit Plan

Date: 2026-05-16
Scope: Step 45.

## Goal

Save the split work in logical checkpoints while keeping generated artifacts and secrets out of Git.

## Recommended Commit Groups

### Commit 1 - Split Planning And Audit Reports

Files:

- root `*_PLAN.md`
- root `*_REPORT.md`
- root handoff/checklist files
- `FINAL_STAGED_FILE_AUDIT.md`
- `CLEAN_COMMIT_PLAN.md`

Purpose:

- Preserve the migration history and decisions.

### Commit 2 - Split Application Repositories

Files:

- `breeding-app-breeder/**` source/config/public/native files
- `breeding-app-admin/**` source/config/public files
- `breeding-app-lab/**` source/config/public files
- `breeding-app-marketplace/**` source/config/public files
- `breeding-app-backend/**` source/config/prisma files
- `breeding-app-shared/**` source/config files

Exclude:

- `build/**`
- `dist/**`
- `node_modules/**`
- signing files
- real `.env` files

### Commit 3 - Backend Stabilization And Security Cleanup

Files:

- `breeding-app-backend/src/app.ts`
- `breeding-app-backend/src/config/env.ts`
- `breeding-app-backend/src/middleware/roles.ts`
- `breeding-app-backend/src/services/orderService.ts`
- `breeding-app-backend/src/services/orderResultService.ts`
- `breeding-app-backend/src/tests/labRoutes.test.ts`
- `breeding-app-breeder/.gitignore`
- `breeding-app-breeder/android/.gitignore`
- `breeding-app-shared/vitest.config.mts`

Purpose:

- Keep backend build/test passing.
- Harden production CORS.
- Keep signing files ignored.
- Add first backend route contract coverage.

## Practical Current Recommendation

Because the split app source is already staged as one large work unit, the safest immediate approach is one checkpoint commit after verifying no generated artifacts or secrets are staged.

Suggested message:

```text
chore: stabilize split app repositories
```

## Pre-Commit Checks

- `git diff --cached --name-only`
- Confirm no generated artifacts are staged.
- Confirm no signing files are staged.
- Run builds/tests if code changed.

## Do Not Do

- Do not push.
- Do not deploy.
- Do not delete legacy source folders.
- Do not rewrite history.

