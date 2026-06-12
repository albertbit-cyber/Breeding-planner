# Production Environment Final Checklist

Date: 2026-05-16
Scope: Step 57.

## Backend Private Secrets

Required:

- `NODE_ENV=production`
- `DATABASE_URL=<managed-postgres-url>`
- `JWT_SECRET=<long-random-secret>`
- `CORS_ORIGIN=<comma-separated deployed frontend origins>`

Optional:

- `PORT=<host-provided-port>`
- `JWT_REFRESH_SECRET=<future-refresh-secret>`
- `COOKIE_SECRET=<future-cookie-secret>`
- `PAYMENT_PROVIDER_SECRET=<future>`
- `PAYMENT_WEBHOOK_SECRET=<future>`
- `MAIL_PROVIDER_API_KEY=<future>`
- `STORAGE_ACCESS_KEY_ID=<future>`
- `STORAGE_SECRET_ACCESS_KEY=<future>`
- `SENTRY_DSN=<future>`

## Frontend Public Variables

Each frontend:

- `VITE_API_URL=https://<backend-host>/api`
- `PUBLIC_URL=/`

Breeder optional:

- `VITE_GOOGLE_CLIENT_ID=<public-oauth-client-id-if-used>`

## Per App

### Breeder

- `VITE_API_URL`
- `PUBLIC_URL`
- optional `VITE_GOOGLE_CLIENT_ID`

### Admin

- `VITE_API_URL`
- `PUBLIC_URL`

### Lab

- `VITE_API_URL`
- `PUBLIC_URL`

### Marketplace

- `VITE_API_URL`
- `PUBLIC_URL`

## Warnings

- Do not put `DATABASE_URL` in frontend apps.
- Do not put `JWT_SECRET` in frontend apps.
- Do not use `localhost` URLs in production frontend builds.
- Do not use wildcard CORS in production.
- Do not commit real `.env` files.

## Required Deployment Checks

- Backend migration deploy runs against intended DB.
- Backend `/health`, `/api/health`, and `/api/system/health` are reachable.
- All deployed frontend origins are listed in `CORS_ORIGIN`.
- HTTPS enforced everywhere.

