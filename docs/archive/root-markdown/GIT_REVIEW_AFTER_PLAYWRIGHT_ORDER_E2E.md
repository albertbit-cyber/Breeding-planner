# Git Review After Playwright Order E2E

Date: 2026-05-17

## Commands Run

```powershell
git status --short
git diff --stat
git diff --name-only
```

## Current Tracked Modifications

Order E2E stage changed or added tracked-path changes under:

- `.gitignore`
- `breeding-app-lab/package.json`
- `breeding-app-lab/package-lock.json`
- `breeding-app-lab/playwright.config.ts`
- `breeding-app-lab/vite.config.mts`
- `breeding-app-lab/tests/e2e/*`
- `breeding-app-lab/src/features/lab/api/client.ts`
- report `.md` files in the repo root

Pre-existing dirty files still present:

- `src/App.jsx`
- `src/App.css`

These root files were not part of the latest Lab order E2E work.

## Generated / Secret Files To Avoid

Do not commit:

- `breeding-app-backend/.env`
- `breeding-app-lab/.env.e2e.local`
- `breeding-app-lab/playwright/.auth`
- `breeding-app-lab/playwright-report`
- `breeding-app-lab/test-results`
- build output folders
- signing files or keystores

## Push Readiness

Do not push without explicit approval.

Before committing, review all untracked report files and decide whether to commit them together or split reports from code/config.

## Local Warning

Git still prints:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This has not blocked work.
