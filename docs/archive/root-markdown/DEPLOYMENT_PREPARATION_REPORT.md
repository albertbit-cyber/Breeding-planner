# Deployment Preparation Report

Date: 2026-05-16
Scope: Step 30 deployment preparation for the split Breeding Planner system. No deployment was performed.

## Recommended Deployment Order

1. Database
2. Backend API
3. Shared package, if published or consumed outside the monorepo
4. Breeder app
5. Admin app
6. Lab app
7. Marketplace app

## Recommended Hosting

| Component | Recommended hosting | Rationale |
| --- | --- | --- |
| Database | Managed PostgreSQL such as Neon, Supabase Postgres, Railway, Render Postgres, or AWS RDS | Prisma-compatible hosted Postgres with backups and connection strings. |
| Backend API | Render, Railway, Fly.io, AWS ECS/App Runner, or similar Node host | Needs long-running Node process, env vars, and Prisma migrations. |
| Shared package | Private npm/GitHub Packages or workspace-linked build artifact | Publish only if the apps are truly independent repos; otherwise pin via Git tag or package tarball. |
| Breeder app | Vercel, Netlify, Cloudflare Pages, or static host; mobile builds through Capacitor pipeline | Vite static app plus optional Android workflow. |
| Admin app | Vercel, Netlify, Cloudflare Pages, or static host | Vite static app. Restrict access at app/backend role level. |
| Lab app | Vercel, Netlify, Cloudflare Pages, or static host | Vite static app. |
| Marketplace app | Vercel, Netlify, Cloudflare Pages, or static host | Vite static app. |

## Build And Start Commands

| Component | Install | Build | Start/Deploy |
| --- | --- | --- | --- |
| `breeding-app-backend` | `npm ci` | `npm run build` | `npm run start` |
| `breeding-app-shared` | `npm ci` | `npm run build` | Publish/link artifact if needed |
| `breeding-app-breeder` | `npm ci` | `npm run build` | Deploy generated `build`/Vite output per host |
| `breeding-app-admin` | `npm ci` | `npm run build` | Deploy generated `build`/Vite output per host |
| `breeding-app-lab` | `npm ci` | `npm run build` | Deploy generated `build`/Vite output per host |
| `breeding-app-marketplace` | `npm ci` | `npm run build` | Deploy generated `build`/Vite output per host |

## Backend URL Setup

Set each frontend `VITE_API_URL` to the deployed backend API base URL, for example:

```text
VITE_API_URL=https://api.example.com/api
```

Do not point production frontends at local or LAN URLs.

## CORS Setup

Set backend `CORS_ORIGIN` to a comma-separated allowlist of exact production frontend origins:

```text
CORS_ORIGIN=https://breeder.example.com,https://admin.example.com,https://lab.example.com,https://marketplace.example.com
```

Production should not run with empty `CORS_ORIGIN` or wildcard behavior.

## Database Setup

- Provision a managed PostgreSQL database.
- Set backend `DATABASE_URL` to the hosted connection string.
- Run Prisma migrations before or during backend release with `npm run prisma:migrate:deploy`.
- Seed only intentional non-sensitive bootstrap data.
- Enable automated backups before launch.

## Rollback Plan

- Keep the previous backend build/release available in the hosting provider.
- Take a database backup before first production migration.
- Prefer additive migrations for first deployment.
- If frontend release fails, roll static apps back to the previous deployment while leaving backend compatible.
- If backend release fails before migration, roll back the backend service.
- If backend release fails after migration, use the tested restore/migration rollback path rather than manual data edits.

## Post-Deployment Test Checklist

- Backend `/health` and `/api/health` return success.
- Register/login/recover flows work against production backend.
- Admin routes reject non-admin users.
- Lab write routes reject non-lab/non-admin users.
- Breeder snapshot reads/writes are owner-scoped.
- Marketplace public listing browsing shows only intended public data.
- Listing creation/editing is limited to breeder/admin owners.
- CORS rejects an unapproved origin.
- Frontend apps use HTTPS and the deployed backend URL.
- Logs show no tokens, passwords, or request-body secrets.

## Deployment Status

Not deployed. Deployment should wait for the security fixes and environment checklist.

