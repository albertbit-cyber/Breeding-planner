# Deployment Environment Checklist

Date: 2026-05-16
Scope: Step 30 environment checklist. No environment values were changed.

## Database

- [ ] Managed PostgreSQL instance provisioned.
- [ ] Production `DATABASE_URL` created.
- [ ] Database credentials stored only in backend hosting secret manager.
- [ ] Automated backups enabled.
- [ ] Migration command tested: `npm run prisma:migrate:deploy`.

## Backend API

- [ ] `PORT` configured if required by host.
- [ ] `NODE_ENV=production`.
- [ ] `DATABASE_URL` points to production database.
- [ ] `JWT_SECRET` is strong, unique, and not reused from local/dev.
- [ ] `CORS_ORIGIN` contains exact deployed frontend origins.
- [ ] Build command: `npm run build`.
- [ ] Start command: `npm run start`.
- [ ] Health checks configured for `/health` or `/api/health`.
- [ ] Logs reviewed for sensitive data exposure.

## Shared Package

- [ ] Decide whether to publish, pack, or link the shared package.
- [ ] If published, package registry credentials are scoped and stored securely.
- [ ] Build command passes: `npm run build`.
- [ ] Consuming apps pin a known version or commit.

## Frontend Apps

- [ ] `breeding-app-breeder` `VITE_API_URL` set to production backend `/api`.
- [ ] `breeding-app-admin` `VITE_API_URL` set to production backend `/api`.
- [ ] `breeding-app-lab` `VITE_API_URL` set to production backend `/api`.
- [ ] `breeding-app-marketplace` `VITE_API_URL` set to production backend `/api`.
- [ ] Breeder app `VITE_GOOGLE_CLIENT_ID` set if Google sign-in/integration is used.
- [ ] Build command for each frontend: `npm run build`.
- [ ] Static host redirects/rewrite rules configured for SPA routing.
- [ ] HTTPS enforced.

## Access Control Verification

- [ ] Admin-only routes tested with admin and non-admin users.
- [ ] Lab-only writes tested with lab, breeder, and admin users.
- [ ] Breeder data owner isolation tested with two users.
- [ ] Marketplace seller ownership tested.
- [ ] Marketplace public response fields approved.

## Release Gates

- [ ] Split repository `.gitignore` files added before publication.
- [ ] Generated folders excluded or intentionally versioned.
- [ ] No local `.env` files copied into published repos.
- [ ] Security fixes from `SECURITY_FIXES_NEEDED.md` resolved or accepted.
- [ ] Rollback procedure tested or documented by hosting provider.

