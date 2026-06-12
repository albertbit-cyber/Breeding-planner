# Local Artifact Exclusion Report

Date: 2026-05-21

## Scope

Reviewed local artifacts for deployment exclusion. No files were deleted and no secret values were read.

## Ignored Local Artifacts Found

`git ls-files -o -i --exclude-standard` confirmed ignored local-only files including:

- `.env`
- `.env.local`
- `.codex-*.log`
- `.tools/android-commandlinetools.zip`
- `.tools/android-sdk/**`

These are correctly excluded from normal staging by existing ignore rules.

## Additional Local Artifacts Found

Root local artifacts present in the working directory:

- `Breeding-planner-project.zip`
- `node-v22.11.0-win-x64.zip`
- root `build/`
- root `dist/`

These are not shown as normal untracked deployment candidates, but they should remain excluded and should not be force-added.

## Pending `.gitignore` Improvement

The working tree already contains a `.gitignore` change adding exclusions for:

- `breeding-app-backend/.env`
- `breeding-app-lab/.env.e2e.local`
- `breeding-app-lab/playwright/.auth`
- `breeding-app-lab/playwright-report`
- `breeding-app-lab/test-results`
- `breeding-app-breeder/.env.e2e.local`
- `breeding-app-breeder/playwright/.auth`
- `breeding-app-breeder/playwright-report`
- `breeding-app-breeder/test-results`

This change belongs in the deployment branch because it prevents local credentials and E2E outputs from being accidentally staged.

## Exclusion Decision

Exclude from deployment branch:

- all `.env*` files containing local secrets or environment-specific values
- `.codex-*.log`
- `.tools/`
- root archive files
- generated build outputs
- Playwright reports, traces, auth state, screenshots, videos, and `test-results`
- `.claude/settings.json` and `.vscode/settings.json` unless explicitly approved as project-level tool/editor policy

