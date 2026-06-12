# Staging Deployment Dry Run Plan

Date: 2026-05-17
Scope: Step 75

## Goal

Prepare a staging deployment dry run after local E2E passes. This is not production deployment.

## Prerequisites

- local/staging E2E database verified
- backend migrations tested against staging
- backend health and DB check pass
- one frontend verified against backend
- no generated artifacts or secrets committed

## Staging Components

- managed PostgreSQL staging database
- backend staging service
- breeder frontend staging site
- admin frontend staging site
- lab frontend staging site
- marketplace frontend staging site

## Backend Staging Env

Required:

- `NODE_ENV=production` or staging-specific production-like mode
- `DATABASE_URL=<staging-db-url>`
- `JWT_SECRET=<staging-secret>`
- `CORS_ORIGIN=<staging-frontend-origins>`

## Frontend Staging Env

Each frontend:

- `VITE_API_URL=https://<staging-backend>/api`
- `PUBLIC_URL=/`

## Deployment Order

1. Provision staging DB.
2. Deploy backend.
3. Run Prisma migrate deploy against staging.
4. Seed staging test accounts if approved.
5. Verify backend health.
6. Deploy one frontend.
7. Verify login and catalog/pricing.
8. Deploy remaining frontends.
9. Run smoke checklist.

## Smoke Tests

- backend health
- login/admin
- login/breeder
- login/lab
- lab catalog/pricing
- marketplace listing browse/auth behavior
- CORS rejection from unapproved origin

## Rollback

- keep previous backend deploy available
- keep DB backup/snapshot before migration
- roll back frontend static deploys by previous build
- do not run destructive migrations in dry run

## Do Not Do

- do not use production database
- do not use production secrets
- do not make marketplace public without DTO implementation
- do not deploy production

