# Stabilized Split Commit Report

Date: 2026-05-16
Scope: Step 47.

## Commit Created

Created checkpoint commit:

```text
7b0b66f chore: stabilize split app repositories
```

## Commit Contents

The commit includes:

- split app repository folders
- backend source, Prisma schema, migrations, and tests
- shared package source and test config
- frontend split app source/config/public assets
- planning, implementation, cleanup, security, and deployment reports
- first API migration planning reports
- backend catalog/pricing route contract tests

## Excluded From Commit

The commit did not include staged generated/dependency/secret path patterns for:

- `breeding-app-*/build/**`
- `breeding-app-*/node_modules/**`
- `breeding-app-backend/dist/**`
- `breeding-app-shared/dist/**`
- `breeding-app-breeder/android/key.properties`
- `*.jks`
- `*.keystore`

## Verification Before Commit

Passed:

- backend build
- backend tests
- shared build
- shared tests
- breeder build
- breeder tests
- admin build
- admin tests
- lab build
- lab tests
- marketplace build
- marketplace tests

## Not Done

- No push.
- No deployment.
- No legacy source deletion.

