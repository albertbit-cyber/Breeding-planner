# Initial Staging Topology Plan

## Recommended Topology
- One staging backend service.
- One staging PostgreSQL database.
- Separate static frontend deployments for breeder, lab, admin, and marketplace.
- Object storage or isolated local volume for upload staging.

## Boundaries
- Staging database must be isolated from production.
- E2E reset must only target local or dedicated staging test DB.
- Rate limiters should be active in staging with `NODE_ENV=production`.

## Before Deploy
- Clean live E2E.
- Confirm backup/rollback.
- Confirm migration deploy plan.

