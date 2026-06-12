# Final Staged File Audit

Date: 2026-05-16
Scope: Step 44 implied audit for API migration/publication steps.

## Summary

The staged index was audited after generated artifact cleanup.

Results at audit time:

- Staged files: 807.
- Unstaged tracked files: 13 before this report batch.
- No staged generated/dependency artifact patterns were found for:
  - `breeding-app-*/build/**`
  - `breeding-app-*/node_modules/**`
  - `breeding-app-backend/dist/**`
  - `breeding-app-shared/dist/**`
- No staged signing-secret path was found for:
  - `breeding-app-breeder/android/key.properties`

## Safe Staged Categories

The staged set primarily contains:

- split repository source files
- split repository public/static assets
- split repository config files
- backend Prisma migrations/schema/seed
- root planning and audit reports
- split app README and `.env.example` files

## Files To Keep Out Of Commits

Do not stage or commit:

- `node_modules/`
- frontend `build/`
- backend/shared `dist/`
- `.env`
- `.env.*` except `.env.example`
- `breeding-app-breeder/android/key.properties`
- `*.jks`
- `*.keystore`

## Warnings

Git still prints:

```text
warning: unable to access 'C:\Users\alber/.config/git/ignore': Permission denied
```

This is an environment permission warning and does not change the audit outcome.

