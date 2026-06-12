# Security Review Report

Date: 2026-05-16
Scope: Step 28 audit of the split Breeding Planner system before deployment. No backend, shared, or frontend source files were changed.

## Summary

Deployment should wait until the items in `SECURITY_FIXES_NEEDED.md` are resolved or explicitly accepted. The split backend has a reasonable baseline for authentication, role checks, owner-scoped breeder data, Helmet, auth rate limiting, and input normalization, but several deployment-readiness gaps remain.

## Checks

| Check | Result | Notes |
| --- | --- | --- |
| No secrets committed | Needs review | Root `.env` and `.env.local` contain local API URLs only. `server/.env` contains a local Postgres URL and dev JWT secret. These files are ignored and did not appear in `git status`, but they must not be copied into split repos or deployment artifacts. |
| No service role keys in frontend | Pass | No Supabase service-role style keys were found in split frontend source or `.env.example` files during this audit. |
| No database passwords in frontend | Pass | Frontend `.env.example` files contain `VITE_API_URL` only, except breeder also has empty `VITE_GOOGLE_CLIENT_ID`. |
| `.env` files are ignored | Pass with caution | Root `.gitignore` ignores `.env` and `.env.local`; these patterns apply by basename. Split repos do not yet have their own root `.gitignore` files, so each future standalone repository needs one. |
| `.env.example` placeholders only | Pass | Backend examples use placeholder `USER:PASSWORD@HOST` and `replace-with-a-long-random-secret`; frontend examples use local API URLs only. |
| Admin routes protected | Pass | `breeding-app-backend/src/routes/adminRoutes.ts` applies `requireAuth` and `requireRole("admin")` to the router. Admin marketplace and subscription routes also use admin role checks. |
| Lab routes protected | Pass | Lab catalog/pricing reads require auth; lab/admin writes require `admin` or `lab`. Lab orders have role checks. |
| Breeder data owner-protected | Pass | Breeder snapshot controllers use `req.user.id`; service queries are scoped by `ownerId`. |
| Marketplace exposes only public listing data | Needs review | Public listing queries filter by availability/status and public profile data. However, normalized listing responses include `sellerUserId` and profile-derived public fields; confirm this is intended public data before launch. |
| Backend validates permissions | Pass with exceptions | Most sensitive services enforce actor ownership or role. Admin moderation is service-guarded. |
| Backend validates input | Partial | Auth uses Zod. Several domain routes normalize and bound text, numbers, dates, and arrays manually. Additional schema validation is recommended for marketplace/listing/lab order write endpoints. |
| CORS configured safely | Needs fix | Production allows all origins when `CORS_ORIGIN` is empty because `!origins.length` is accepted. Deployment must require explicit origins. |
| Authentication tokens handled safely | Needs review | API client stores bearer tokens in `localStorage`. This is common for SPAs but increases XSS impact; deployment should confirm CSP/XSS posture or move toward httpOnly secure cookies later. |

## Noted Protections

- `helmet()` is enabled in `breeding-app-backend/src/app.ts`.
- Auth endpoints use `express-rate-limit` in `breeding-app-backend/src/routes/authRoutes.ts`.
- JWT validation is centralized in `breeding-app-backend/src/middleware/auth.ts`.
- Role enforcement is centralized in `breeding-app-backend/src/middleware/roles.ts`.
- Backend requires `DATABASE_URL` and `JWT_SECRET` at startup.

## Files Inspected

- Root `.gitignore`
- Root and split `.env.example` files
- Local ignored `.env` files for deployment-risk review
- `breeding-app-backend/src/app.ts`
- `breeding-app-backend/src/config/env.ts`
- `breeding-app-backend/src/middleware/auth.ts`
- `breeding-app-backend/src/middleware/roles.ts`
- `breeding-app-backend/src/routes/*`
- Selected backend controllers and services for breeder data, listings, and marketplace

