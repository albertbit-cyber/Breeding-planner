# Final Git Worktree Audit

Date: 2026-05-20

## Summary

Final audit before deployment branch preparation.

Observed:

- Total `git status --short` entries: 405
- Untracked entries: 357
- Markdown/report entries: 326
- Deleted entries: 9 duplicate breeder lab component paths

## Runtime Code Areas

- Backend runtime, Prisma schema, migrations, services, middleware, routes, tests.
- Breeder app runtime, lab integration UI, Playwright config/tests.
- Lab app runtime, Playwright config/tests.
- Shared API clients across admin, marketplace, breeder, lab, shared, and root app.
- Root live E2E runner.
- CI/dependency workflow.

## Generated/Report Areas

Most untracked files are generated Markdown reports and handoffs from the staged planning process.

## Large Local Artifacts Found

Large non-deployment artifacts exist under:

- `.tools/`
- Android SDK/Gradle local directories
- local JDK zip files
- `node-v22.11.0-win-x64`
- `node-v22.11.0-win-x64.zip`
- `Breeding-planner-project.zip`

These should not be included in a deployment commit unless explicitly intended.

## Secret Scan

A file-location-only secret pattern scan did not return matching files. No secret values were printed.

## Unsafe/Review Items

- `.claude/settings.json`
- `.vscode/`
- local tool archives
- generated report flood
- deleted duplicate component files
- Git warning: `unable to access 'C:\Users\alber/.config/git/ignore': Permission denied`

## Action

No files were deleted or modified by this audit.

