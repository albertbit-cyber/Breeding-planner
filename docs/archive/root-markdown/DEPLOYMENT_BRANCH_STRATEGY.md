# Deployment Branch Strategy

Date: 2026-05-20

## Branches

- `development`: active integration branch.
- `staging`: deployable staging branch.
- `main` or `production`: production release branch.
- `hotfix/<issue>`: urgent patch branch from production.

## Flow

1. Runtime changes land in `development`.
2. Validated runtime commits merge into `staging`.
3. Staging deploys and validates.
4. Approved staging state merges into `production`.
5. Production releases are tagged.

## Protections

- Require passing tests/builds before merge.
- Require review for production.
- Disallow direct production pushes.
- Require explicit approval for deployment.

## Rollback

- Tag every production release.
- Keep previous backend/frontend artifacts.
- Roll back frontend first for UI/API mismatch.
- Restore DB only for data corruption or destructive migration failure.

