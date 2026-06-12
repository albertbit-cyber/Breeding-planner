# Railway Backend Lockfile Fix Report

Date: 2026-06-02

## Status

Completed and pushed.

The Railway backend build lockfile issue was addressed by pinning Prisma package versions exactly and regenerating the backend lockfile with npm.

## Branch

- Branch: `staging/runtime-review-20260521`
- New commit: `296815e` (`Pin backend Prisma versions for Railway build`)
- Remote branch: `origin/staging/runtime-review-20260521`
- Remote HEAD verified: `296815eb0bb00a744413529155b8dc4c5d3c8f96`

## Files Changed In Commit

Only these files were staged and committed:

- `breeding-app-backend/package.json`
- `breeding-app-backend/package-lock.json`

No unrelated dirty worktree files were staged.

## Change Summary

Pinned backend Prisma versions:

- `@prisma/client`: `^6.5.0` -> `6.5.0`
- `prisma`: `^6.5.0` -> `6.5.0`

Regenerated the backend lockfile by running:

```bash
npm install
```

from:

```text
breeding-app-backend
```

The regenerated lockfile includes the previously missing dependency entries needed by the resolved backend dependency tree:

- `@emnapi/core`
- `@emnapi/runtime`

## Validation

Completed:

- Confirmed current branch was `staging/runtime-review-20260521`.
- Confirmed `breeding-app-backend/package.json` and `breeding-app-backend/package-lock.json` were clean before the fix.
- Ran `npm install` in `breeding-app-backend`.
- Verified the staged commit contained only the two intended backend package files.
- Ran `git diff --check` for the two changed files.
- Pushed the commit to `origin/staging/runtime-review-20260521`.
- Verified remote branch HEAD after push.

Not completed:

- Local `npm ci` verification could not run because the Windows sandbox failed before npm started.
- Railway redeploy could not be triggered from this workspace because the `railway` CLI is not installed and no Railway provider access is available here.

## Commands Run

```bash
git branch --show-current
git status --short -- breeding-app-backend/package.json breeding-app-backend/package-lock.json
npm.cmd install
git diff --check -- breeding-app-backend/package.json breeding-app-backend/package-lock.json
git add package.json package-lock.json
git commit -m "Pin backend Prisma versions for Railway build"
git push origin staging/runtime-review-20260521
git ls-remote --heads origin staging/runtime-review-20260521
```

No `npm audit fix --force` command was run.

## Railway Redeploy

Railway redeploy status: blocked from this workspace.

Reason:

- `railway` CLI is not installed.
- No provider access or Railway service metadata is available in this workspace.

Next action:

- Trigger a Railway redeploy for the backend service connected to `staging/runtime-review-20260521`.
- Confirm Railway pulls commit `296815e`.
- Confirm the backend service root remains `breeding-app-backend`.
- Confirm Railway uses the staging environment only.

## Safety Notes

- No secrets were printed.
- No production deployment was attempted.
- No database migration/reset command was run as part of this lockfile fix.
- Existing unrelated local worktree changes remain unstaged.
