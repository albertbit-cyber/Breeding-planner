# Local PostgreSQL Setup Guide

Date: 2026-05-17

This guide prepares the local database target for the database-backed E2E stage.

## Install Or Confirm PostgreSQL

Use an installed local PostgreSQL server if one already exists. If not installed, install PostgreSQL for Windows and include pgAdmin or command-line tools.

Confirm the server is running before continuing.

## Create A Local Database

Recommended database name:

```text
breeding_planner_local
```

Recommended approach:

```sql
CREATE DATABASE breeding_planner_local;
```

If using a dedicated app user:

```sql
CREATE USER breeding_planner_local_user WITH PASSWORD 'replace-with-local-password';
GRANT ALL PRIVILEGES ON DATABASE breeding_planner_local TO breeding_planner_local_user;
```

PostgreSQL 15+ may also need schema privileges after connecting to the database:

```sql
GRANT ALL ON SCHEMA public TO breeding_planner_local_user;
```

## Backend Env File

Create this file manually:

```text
breeding-app-backend/.env
```

Start from:

```text
breeding-app-backend/.env.example
```

Expected local `DATABASE_URL` shape:

```text
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/breeding_planner_local?schema=public"
```

## Connection Test

You can test the database with `psql` if it is available:

```powershell
psql "postgresql://USER:PASSWORD@localhost:5432/breeding_planner_local?schema=public"
```

Do not paste the real password into committed files or reports.

## Troubleshooting

- If connection is refused, confirm PostgreSQL service is running.
- If authentication fails, confirm user/password and `pg_hba.conf` settings.
- If Prisma reports permission errors, grant database and schema privileges to the app user.
- If port `5432` is unavailable, update `DATABASE_URL` to the port your local PostgreSQL uses.

## Guardrails

- Never point this stage at production.
- Never seed real customer data.
- Never commit `.env`.
- Stop before migrations if the database host is not local.

