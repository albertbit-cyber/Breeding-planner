# First Real Staging Backend Deployment Report

Date: 2026-05-29

## Deployment Status

Status: blocked after successful branch push.

The staging branch was verified locally and pushed to GitHub, but the Railway deployment, Supabase staging PostgreSQL connection, Prisma migration, and runtime validation could not be executed from this workspace because provider access and staging targets are not available here.

No production deployment was attempted.

## Branch And Commit Verification

Verified local branch:

- `staging/runtime-review-20260521`

Verified deployment commits:

- Runtime commit: `a37644f` (`Stage runtime code for staging review`)
- DB migration commit: `9560ed3` (`Add staging database migration and reset tooling`)
- E2E/CI commit: `dfb86a2` (`Add deterministic E2E and CI staging tooling`)

Verified remote branch:

- `origin/staging/runtime-review-20260521`
- Remote HEAD: `dfb86a23ebb3e90f0c1b5d2f677061f03b23b579`

Push result:

- `git push origin staging/runtime-review-20260521` succeeded.
- GitHub created the new remote branch.

## Local Repository State

The branch HEAD is suitable for deployment, but the working tree is not clean.

Observed local working tree:

- 18 modified tracked files, mostly family-tree/lab/electron work not included in the pushed deployment commit.
- 415 total porcelain status lines, mostly untracked local reports/docs.
- Local `.env` and `breeding-app-backend/.env` exist but are not tracked by Git.

Unsafe local artifact notes:

- `.env` files are present locally and must not be committed or copied into provider logs.
- `breeding-app-backend/.env` contains secret-bearing keys by name, including `DATABASE_URL`, `JWT_SECRET`, and Supabase keys. Values were not printed or copied.
- Git reports a permission warning reading `C:\Users\alber/.config/git/ignore`.
- Local uncommitted frontend/family-tree changes are not part of the pushed branch.

## Railway Preparation Status

Railway deployment status: not executed.

Railway checks from this workspace:

- `railway` CLI is not installed.
- `RAILWAY_TOKEN` is not present in the process environment.
- Existing deployment documents still state that no Railway project/service had been created at handoff time.
- No local Railway project metadata was verified.

Required Railway configuration remains external/provider-dashboard work:

- Service connected to `https://github.com/albertbit-cyber/Breeding-planner.git`
- Branch: `staging/runtime-review-20260521`
- Root directory: `breeding-app-backend`
- Build command: provider equivalent of `npm run build`
- Start command: provider equivalent of `npm start`

Required Railway variables to verify/add without exposing values:

- `DATABASE_URL`
- `NODE_ENV=staging`
- `JWT_SECRET`
- `COOKIE_SECRET`
- `CSRF_SECRET`
- `JSON_BODY_LIMIT=8mb`

Note: `RAILWAY_BACKEND_DEPLOYMENT_PLAN.md` previously listed `NODE_ENV=production`; the current deployment request explicitly requires `NODE_ENV=staging`. Use staging unless intentionally revised.

## Supabase Staging PostgreSQL Status

Supabase staging status: not connected from this workspace.

Supabase checks from this workspace:

- `supabase` CLI is not installed.
- No `DATABASE_URL` is present in the process environment.
- Existing setup documents still state that no Supabase staging project/database had been created at handoff time.

No database connection string was printed or validated.

## Prisma Migration Status

Migration status: not run.

Reason:

- No confirmed staging-only Supabase `DATABASE_URL` is available in this process.
- Running `npx prisma migrate deploy` without a verified staging target would violate the deployment stop conditions.

Safety status:

- No `prisma migrate reset` was run.
- No deterministic reset was run.
- No destructive database command was run.

Backend migration script note:

- `breeding-app-backend/package.json` has `prestart: npm run prisma:migrate:deploy`.
- Railway startup may run migrations automatically during deployment, so Railway must be pointed only at the isolated Supabase staging database before deployment.

## Runtime Validation Status

Runtime validation status: not run against Railway.

Blocked validations:

- `/api/health`
- auth initialization
- cookie/CSRF initialization
- Prisma connectivity
- startup logs
- marketplace runtime initialization

Reason:

- No Railway deployment URL/service is available from this workspace.

## Railway URL

Not available.

No Railway deployment was created or discovered from this workspace.

## Rollback Checkpoints

Rollback status: not ready.

Required before migration/deployment:

- Railway previous deployment/version checkpoint, if the service already exists.
- Supabase staging backup/restore point or confirmed disposable staging database.
- Confirmation that the database target is staging-only.
- Confirmation that deterministic E2E reset is either disabled for staging or explicitly allowed against a disposable staging DB.

No rollback checkpoint was created from this workspace.

## Deterministic E2E Compatibility

Preserved at the branch level:

- The pushed branch HEAD is `dfb86a2`, the documented deterministic E2E/CI commit.
- No uncommitted local changes were pushed.

Not executed:

- No staging E2E reset.
- No staging live E2E.

## Unresolved Warnings And Blockers

- Railway CLI unavailable locally.
- Supabase CLI unavailable locally.
- No `RAILWAY_TOKEN` in the process environment.
- No staging `DATABASE_URL` in the process environment.
- Provider resources could not be verified from this workspace.
- Railway service URL is unknown.
- Supabase staging project/DB target is unknown.
- Rollback checkpoint is missing.
- Working tree is dirty with many local uncommitted files unrelated to the pushed branch.

## Next Frontend Deployment Steps

After backend staging deploy succeeds:

1. Record Railway backend URL.
2. Validate `GET /api/health`.
3. Configure Netlify lab staging `VITE_API_URL` to the Railway backend URL.
4. Configure Netlify breeder staging `VITE_API_URL` to the Railway backend URL.
5. Update Railway `CORS_ORIGIN` with the final Netlify lab and breeder origins.
6. Redeploy backend if CORS values change.
7. Run non-destructive staging smoke tests.
8. Decide whether staging live E2E reset is safe before running reset-based suites.

## Required Manual Inputs To Continue

To complete the backend deployment, provide or configure:

- Railway project/service access, or install/authenticate Railway CLI.
- Railway service connected to the GitHub repo and branch.
- Railway service root set to `breeding-app-backend`.
- Supabase staging PostgreSQL project and staging-only connection string entered in Railway.
- Staging-only secret values entered in Railway.
- Railway public backend URL.
- Supabase backup/restore checkpoint or disposable-staging confirmation.
- Explicit confirmation whether staging E2E reset is allowed.
