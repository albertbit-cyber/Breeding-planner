# Railway Backend Deployment Plan

Date: 2026-05-21

## Status

Prepared only. No Railway project, service, variables, or deployment were created.

## Target

- Repository: `https://github.com/albertbit-cyber/Breeding-planner.git`
- Branch: `staging/runtime-review-20260521`
- Service root directory: `breeding-app-backend`
- Build command: `npm.cmd run build` or provider-equivalent `npm run build`
- Start command: `npm.cmd start` or provider-equivalent `npm start`

The backend `prestart` script runs `npm run prisma:migrate:deploy`, so deployment must only happen after the Railway service is pointed at the isolated Supabase staging database.

## Required Railway Variables

Set in Railway only, not in Git:

- `NODE_ENV=production`
- `DATABASE_URL=<supabase-staging-postgres-url>`
- `JWT_SECRET=<staging-only-secret>`
- `CORS_ORIGIN=<netlify-lab-origin>,<netlify-breeder-origin>`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=none`
- `MAX_UPLOAD_BYTES=5242880`
- `JSON_BODY_LIMIT=8mb`
- `UPLOAD_STORAGE_DIR=<railway-volume-path-or-temporary-staging-path>`

Future R2 variables after backend integration:

- `UPLOAD_STORAGE_PROVIDER=r2`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` if public URLs are used

## Deployment Sequence

1. Create Railway staging project/environment.
2. Add backend service from the GitHub repo.
3. Set root directory to `breeding-app-backend`.
4. Configure variables above with staging-only values.
5. Confirm Railway public API domain.
6. Deploy from `staging/runtime-review-20260521`.
7. Confirm Prisma migration runs against Supabase staging only.
8. Validate `GET /api/health`.

## Rollback

- Keep previous Railway deployment available.
- Roll back if migration fails, health fails, auth fails, or core API workflows fail.
- Do not retry with production database values.

## Blockers

- no Railway project/service exists in the workspace
- no staging Supabase `DATABASE_URL`
- no Netlify staging origins for CORS
- no Railway domain

