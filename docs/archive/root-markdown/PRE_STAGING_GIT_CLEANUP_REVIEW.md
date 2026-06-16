# Pre-Staging Git Cleanup Review

Date: 2026-05-20

## Worktree State

The repository is heavily dirty from the broader staged migration series. This batch intentionally did not revert or clean unrelated files.

## Files Touched In This Batch

- `breeding-app-backend/src/app.ts`
- `breeding-app-backend/src/controllers/marketplaceController.ts`
- `breeding-app-backend/src/routes/marketplaceRoutes.ts`
- `breeding-app-backend/src/services/marketplaceRuntimeService.ts`
- `breeding-app-backend/src/tests/marketplaceRuntimeService.test.ts`
- Step 329-347 report files.

## Cleanup Recommendation

Before any staging branch publication:

1. Review untracked report files and decide which should be committed.
2. Review previously deleted duplicated lab component paths under `breeding-app-breeder/src/features/lab/components/components`.
3. Run a fresh `git status --short`.
4. Commit a logical checkpoint before any push or deployment.

