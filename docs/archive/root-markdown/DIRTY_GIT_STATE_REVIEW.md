# Dirty Git State Review

Date: 2026-05-20

## Summary

The worktree is heavily dirty from the multi-stage migration, E2E, security, marketplace, staging, and report batches.

## Observed Categories

- Backend runtime changes.
- Prisma schema and migration changes.
- Auth/session/security changes.
- Marketplace/media/moderation changes.
- Lab and breeder frontend/API-client changes.
- Playwright configs/tests.
- Root live E2E runner.
- Many generated planning/report handoff files.
- Deleted duplicate breeder lab component paths under `breeding-app-breeder/src/features/lab/components/components`.

## Git Warning

Git still prints:

`unable to access 'C:\Users\alber/.config/git/ignore': Permission denied`

This does not block local validation, but should be fixed before publication.

## Recommendation

Do not deploy or publish from this dirty state. First create a deliberate checkpoint commit plan, review all untracked files, and separate runtime code from report artifacts where practical.

