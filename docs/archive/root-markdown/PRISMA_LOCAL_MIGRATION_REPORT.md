# Prisma Local Migration Report

Date: 2026-05-17

## Result

Passed.

The backend Prisma client was generated and the local PostgreSQL schema was applied to the approved local database target.

## Target

| Field | Value |
| --- | --- |
| Database type | Local PostgreSQL |
| Host | localhost |
| Port | 5432 |
| Database | `breeding_planner_local` |
| Schema | `public` |
| Secrets printed | No |

## Commands Run

```powershell
npm.cmd run prisma:generate
```

Result: passed.

```powershell
npm.cmd run prisma:migrate
```

Result: partially applied existing migrations, then stopped because `prisma migrate dev` is interactive and this shell is non-interactive.

```powershell
npm.cmd run prisma:migrate:deploy
```

Result: passed. Prisma reported 23 migrations found and no pending migrations to apply.

## Local Database Creation

The first migration attempt showed the approved local database did not exist. Created the local database:

```sql
CREATE DATABASE breeding_planner_local;
```

## Warnings

- Prisma warns that `package.json#prisma` seed configuration is deprecated and should eventually move to a Prisma config file before Prisma 7.
- `prisma migrate dev` is not suitable in this non-interactive execution context after existing migrations are applied. Use `prisma migrate deploy` for applying existing migrations.
- Prisma printed an informational warning about a unique constraint on `ShedTestOrderResult`; the local database was empty, so this did not block migration.

## Rollback Notes

This stage used a local-only database. If the local test database needs to be reset, drop and recreate `breeding_planner_local`, then rerun migration deploy and seed.

