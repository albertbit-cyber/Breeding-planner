# Runtime And Report File Separation Plan

Date: 2026-05-20

## Runtime Commit Bucket

Include code and config needed to run the app:

- Backend source, Prisma schema/migrations, tests.
- Lab and breeder frontend source/config/tests.
- Shared API clients.
- Live E2E runner.
- Package manifests and lockfiles.
- CI workflow files.

## Report Commit Bucket

Include generated documentation:

- `*_REPORT.md`
- `*_PLAN.md`
- `CHATGPT_*HANDOFF.md`
- release/staging checklists.

## Manual Review Bucket

Review before staging:

- `.vscode/`
- `.claude/settings.json`
- root legacy `src/App.jsx`, `src/App.css`, `src/shared/apiClient.ts`
- deleted duplicate component paths.

## Rule

Runtime must be reviewable without needing to sift through hundreds of report files.

