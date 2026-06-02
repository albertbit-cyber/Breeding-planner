# Final Predeployment Test Plan

Date: 2026-05-16
Scope: Step 58.

## Backend

- `npm.cmd --prefix breeding-app-backend run build`
- `npm.cmd --prefix breeding-app-backend test`
- `npm.cmd --prefix breeding-app-backend run prisma:generate`
- `npm.cmd --prefix breeding-app-backend run prisma:migrate:deploy` against staging DB only
- Verify:
  - `/health`
  - `/api/health`
  - `/api/system/health`

## Shared Package

- `npm.cmd --prefix breeding-app-shared run build`
- `npm.cmd --prefix breeding-app-shared test`

## Frontends

Run for each:

- breeder
- admin
- lab
- marketplace

Commands:

- `npm.cmd --prefix <app> run build`
- `npm.cmd --prefix <app> test`

## Auth Roles

Verify:

- admin can access admin routes
- breeder cannot access admin routes
- lab staff can access lab workflows
- breeder can access own breeder data
- breeder cannot access another breeder's private data
- marketplace seller ownership enforced

## CORS

Verify from each deployed frontend origin:

- auth login
- authenticated API request
- rejected request from non-allowed origin in production-like config

## Database

Verify:

- migrations applied
- seed strategy understood
- backups enabled
- credentials are production-only

## Marketplace Public Data

Before public browsing:

- verify no internal user IDs are exposed
- verify no owner IDs/row IDs are exposed
- verify public contact fields are opt-in only

## Rollback

Document:

- previous backend deployment version
- previous frontend deployment version
- database rollback strategy
- feature flags/fallbacks for local-store migrations

## Release Gate

Do not deploy until all checks pass or exceptions are explicitly accepted.

