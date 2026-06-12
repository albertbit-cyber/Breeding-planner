# Supabase Staging PostgreSQL Setup

Date: 2026-05-21

## Status

Prepared only. No Supabase project or database was created.

## Target

Create a dedicated Supabase project for staging, separate from local and production databases.

## Setup Checklist

1. Create a Supabase project named for staging.
2. Store project region, project ref, and dashboard URL outside the repo.
3. Create or identify a staging database role for the backend.
4. Copy the connection string from the Supabase dashboard.
5. Store the connection string as Railway `DATABASE_URL`.
6. Verify the host/project is staging, not production.
7. Run `prisma migrate deploy` only through the Railway staging backend or a controlled staging migration command.
8. Confirm the migration creates:
   - refresh sessions
   - security events
   - marketplace media/report/block tables
   - family-tree relationship/history tables
   - new `Animal` columns

## Connection Choice

Use the connection mode that supports Prisma migration reliably for the selected Supabase setup. Supabase documents direct and pooler connection strings; migration deploy should be tested against staging before any production design is copied.

## Reset Policy

Do not run deterministic reset against Supabase staging unless the staging database is confirmed disposable or a staging-specific non-destructive E2E mode is selected.

## Backup Policy

Before first migration:

- capture a restore point or backup if the plan supports it
- record migration commit `9560ed3`
- record the Railway deployment version

## Blockers

- no Supabase staging project exists
- no staging connection string exists
- no backup/restore point exists
- staging reset policy is not approved

