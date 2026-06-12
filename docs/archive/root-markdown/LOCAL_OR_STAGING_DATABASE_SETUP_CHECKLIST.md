# Local Or Staging Database Setup Checklist

Date: 2026-05-17
Scope: Step 60

## Current Finding

`breeding-app-backend` currently has only:

```text
.env.example
```

No real backend `.env` file was found. Therefore no local or staging `DATABASE_URL` is confirmed.

## Required Backend Variables

Create a local-only or staging-only backend `.env` based on:

```text
breeding-app-backend/.env.example
```

Required:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=<local-or-staging-postgres-url>
JWT_SECRET=<long-random-non-production-secret>
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
```

Optional:

```env
APP_PUBLIC_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## Database Safety Checklist

- Confirm the target database is not production.
- Prefer a disposable local or staging PostgreSQL database.
- Use a dedicated database user for the app.
- Store `DATABASE_URL` only in backend env/secret storage.
- Do not put `DATABASE_URL` in frontend env files.
- Confirm migrations are intended for this database.
- Confirm rollback/restore plan before staging migrations.
- Confirm seed script is acceptable for the target database before running it.

## Prisma Commands After Confirmation

Only after confirming `DATABASE_URL` points to local/staging:

```powershell
npm.cmd --prefix breeding-app-backend run prisma:generate
npm.cmd --prefix breeding-app-backend run prisma:migrate:deploy
npm.cmd --prefix breeding-app-backend run prisma:seed
```

## Verification Targets

After migration/seed:

- `/health`
- `/api/health`
- `/api/system/health`
- `/api/system/db-check`
- `/api/lab/tests/catalog?breederView=true`
- `/api/lab/tests/pricing`

## Do Not Do

- Do not run migrations against production.
- Do not print or commit secrets.
- Do not commit real `.env` files.

