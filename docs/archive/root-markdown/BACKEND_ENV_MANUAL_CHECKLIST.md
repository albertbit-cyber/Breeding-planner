# Backend Env Manual Checklist

Date: 2026-05-17

Create and verify the backend env file before any migration or runtime E2E command.

## File Path

Create this file locally:

```text
breeding-app-backend/.env
```

Use this template:

```text
breeding-app-backend/.env.example
```

## Required Variables

| Variable | Required | Expected For Local Stage |
| --- | --- | --- |
| `PORT` | Yes | `4000` |
| `NODE_ENV` | Yes | `development` |
| `DATABASE_URL` | Yes | Local PostgreSQL URL only |
| `JWT_SECRET` | Yes | Long local-only secret |
| `CORS_ORIGIN` | Yes | Local frontend origins |
| `APP_PUBLIC_ORIGINS` | Yes | Local frontend origins |

## Optional Variables

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | Leave blank unless explicitly testing Supabase integration. |
| `SUPABASE_ANON_KEY` | Leave blank unless explicitly testing Supabase integration. |
| `SUPABASE_SERVICE_ROLE_KEY` | Leave blank unless explicitly testing Supabase integration. |

## Recommended Local Values

Use this as a shape only. Replace placeholders locally.

```text
PORT=4000
NODE_ENV=development
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/breeding_planner_local?schema=public"
JWT_SECRET="replace-with-a-long-local-random-secret"
CORS_ORIGIN="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176"
APP_PUBLIC_ORIGINS="http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176"
SUPABASE_URL=""
SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""
```

## Git Safety

The repo now ignores:

```text
/breeding-app-backend/.env
```

Before migration, run:

```powershell
git check-ignore breeding-app-backend/.env
```

The command must report `breeding-app-backend/.env`.

## Do Not Continue If

- `DATABASE_URL` points to production.
- `DATABASE_URL` points to an unknown remote host.
- `JWT_SECRET` is missing.
- `.env` is not ignored by Git.
- Any secret would need to be printed in a report.

