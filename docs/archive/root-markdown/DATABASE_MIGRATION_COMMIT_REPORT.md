# Database Migration Commit Report

Date: 2026-05-21

## Status

Blocked pending explicit commit approval.

## Proposed Files

- `breeding-app-backend/prisma/schema.prisma`
- `breeding-app-backend/prisma/migrations/20260520143000_add_refresh_sessions_security_events_and_media/migration.sql`
- `breeding-app-backend/prisma/e2eReset.ts`

## Safety Rules

- Apply only against staging PostgreSQL after an isolated staging `DATABASE_URL` is configured.
- Do not run migrations against production.
- Do not expose database URLs in commits or reports.

## Validation

No migration command was run because staging PostgreSQL is not provisioned and no deployment approval exists.

