# Backup Branch Report

Generated from `03_create_backup_branch.md`.

## Summary

Created a safe Git backup branch before any repository split or refactor work.

Backup branch:

```text
backup-before-repo-split
```

The branch was created from the current commit:

```text
7c6f735 Merge remote-tracking branch 'origin/gh-pages' into all-branches-merged
```

Current working branch remains:

```text
all-branches-merged
```

No app code was deleted, moved, or refactored.

## Git Status Checked

Current branch:

```text
all-branches-merged...origin/all-branches-merged
```

Uncommitted changes at the time of backup:

```text
?? CODEBASE_SPLIT_AUDIT.md
?? TARGET_ARCHITECTURE.md
```

After this report was created, this file is also uncommitted:

```text
?? BACKUP_BRANCH_REPORT.md
```

Important note:

- The backup branch protects the committed app state at commit `7c6f735`.
- The planning documents are currently untracked and are not included in that branch until they are committed.
- If these reports should be part of the backup, commit them on `all-branches-merged` and update or recreate the backup branch from that commit.

## Branch Creation Result

The first branch creation attempt failed because Git could not create a lock file in `.git/refs/heads` due to permission restrictions.

The branch was then created successfully using approved Git branch permissions.

Verified branch:

```text
backup-before-repo-split 7c6f735 Merge remote-tracking branch 'origin/gh-pages' into all-branches-merged
```

## Ignored Files

The full ignored-file scan timed out because the repository contains large ignored folders and generated output.

Ignored paths and patterns confirmed from `.gitignore`:

- `node_modules`
- `server/node_modules`
- `build`
- `dist`
- `server/dist`
- `.tools`
- `.env`
- `.env.local`
- `server/.env`
- `.codex-*.log`
- `server/*.log`
- `coverage`
- Electron installer output such as `*.exe`
- Android signing secrets such as `*.keystore`, `*.jks`, `android/key.properties`
- npm/yarn debug logs

There is also a recurring Git warning:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This warning does not stop the local repository status commands, but it should be fixed later because it can make Git ignore behavior less predictable.

## Important Local Files Not Committed

Untracked files reported by Git:

- `CODEBASE_SPLIT_AUDIT.md`
- `TARGET_ARCHITECTURE.md`
- `BACKUP_BRANCH_REPORT.md`

Local generated/runtime files observed in the repository root:

- `.codex-server-err.log`
- `.codex-server-out.log`
- `.codex-vite-err.log`
- `.codex-vite-out.log`
- `.codex-vite-lan-err.log`
- `.codex-vite-lan-out.log`
- `Breeding-planner-project.zip`
- `node-v22.11.0-win-x64.zip`
- `node-v22.11.0-win-x64/`
- `build/`
- `dist/`
- `node_modules/`

Local generated/runtime files observed in `server/`:

- `server/.env`
- `server/dist/`
- `server/node_modules/`
- `server/.codex-server-*.log`
- `server/.npm-dev-*.log`
- `server/.tsx-*.log`

Local snapshot or cleanup-review files observed:

- `App_prev.jsx`
- `HEAD_App.jsx`
- `main_App.jsx`
- `=`
- `0.0001`

These should be reviewed before the final split. They look like local snapshots, merge artifacts, or temporary files and should not automatically be copied into every new repository.

## Package Lock Files

Root package files:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`

Backend package files:

- `server/package.json`
- `server/package-lock.json`

Attention needed:

- The root has both npm and pnpm lockfiles.
- Before splitting repositories, choose the package manager policy for each target repo.
- If the split keeps npm, remove/ignore `pnpm-lock.yaml` after confirming it is not needed.
- If the split uses pnpm, regenerate package metadata consistently and avoid mixing lockfile strategies.

## Environment Files

Root environment files observed:

- `.env`
- `.env.local`
- `.env.example`
- `.env.android-development`
- `.env.android-staging`
- `.env.android-production`

Backend environment files observed:

- `server/.env`
- `server/.env.example`

Environment variables documented in examples:

- `VITE_API_URL`
- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `SEARCH_PROVIDER`
- `BING_SEARCH_KEY`
- `SERPAPI_KEY`
- `SQLITE_PATH`
- `CACHE_TTL_HOURS`
- `CACHE_ONLY`

Security note:

- Real `.env` files should stay uncommitted.
- Only `.env.example` files should be committed.
- Frontend repos must not receive backend secrets such as `DATABASE_URL` or `JWT_SECRET`.

## Safe Backup Instructions

To return to the backup state later:

```text
git switch backup-before-repo-split
```

To update the backup branch after committing the planning reports:

```text
git branch -f backup-before-repo-split all-branches-merged
```

Only force-update the backup branch if you intentionally want the backup to include newer commits.

## Still Needs Attention Before Split

- Commit the planning reports if they should be preserved in Git.
- Decide whether to keep npm, pnpm, or separate policies per repo.
- Fix the global Git ignore permission warning at `C:\Users\alber/.config/git/ignore`.
- Exclude generated folders and archives from split inputs.
- Review root snapshot files and temporary files before copying source into new repos.
- Confirm whether Electron and mobile packaging stay with the breeder app or become separate shells later.

