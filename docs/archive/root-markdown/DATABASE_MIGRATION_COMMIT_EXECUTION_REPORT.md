# Database Migration Commit Execution Report

Date: 2026-05-21

## Commit Created

- Commit: `9560ed3`
- Message: `Add staging database migration and reset tooling`
- Branch: `staging/runtime-review-20260521`

## Included

- `breeding-app-backend/prisma/schema.prisma`
- `breeding-app-backend/prisma/migrations/20260520143000_add_refresh_sessions_security_events_and_media/migration.sql`
- `breeding-app-backend/prisma/e2eReset.ts`
- `breeding-app-backend/package.json`
- `breeding-app-backend/package-lock.json`

## Migration Verification

Before committing, the migration was checked against the schema changes. The initial migration SQL did not include the new family-tree schema changes, so it was corrected to add:

- `Animal.globalId`
- `Animal.privacyLevel`
- `parent_relationships`
- `ownership_history`

## Safety

- No migration was applied.
- No staging or production database was contacted.
- No credentials or `.env` values were read or exposed.
- Reset tooling remains guarded by local-only database checks and `E2E_RESET_CONFIRM=local`.

## Push Status

No push was performed.

