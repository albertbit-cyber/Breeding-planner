# Backend API Plan

Generated for Step 05 of the repo split planning phase. This is a planning document only; no backend code was changed.

## Goal

Use one shared backend API for the future apps:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`

Frontend apps must not connect directly to PostgreSQL or Prisma. The shared backend owns authentication, authorization, business rules, direct database access, audit logging, subscriptions, public/private field filtering, and mutation workflows.

## Current Backend Baseline

The current repo already has a shared Express/Prisma backend in `server/`.

Important files:

- `server/src/app.ts` mounts the API routes.
- `server/src/server.ts` starts the HTTP server.
- `server/src/middleware/auth.ts` verifies JWT bearer tokens.
- `server/src/middleware/roles.ts` enforces role guards.
- `server/src/lib/prisma.ts` owns Prisma access.
- `server/prisma/schema.prisma` defines the PostgreSQL schema.
- `server/prisma/migrations/` contains existing schema migrations.
- `server/prisma/seed.ts` seeds catalog/subscription style data.

Current mounted route groups:

| Route group | Current purpose |
| --- | --- |
| `/health`, `/api/health` | Health checks for deployment and frontend diagnostics. |
| `/api/auth` | Login, register, refresh, password recovery, current user. |
| `/api/breeder` | Breeder snapshot sync for animals, pairings, clutches, listings payload data. |
| `/api/profiles` | Current user profile and marketplace profile lookup. |
| `/api/listings` | Legacy/current seller listings, marketplace listing export, moderation listing status. |
| `/api/inquiries` | Listing inquiries and seller/buyer inquiry updates. |
| `/api/searches` | Saved marketplace searches. |
| `/api/notifications` | User notifications. |
| `/api/subscriptions` | Public subscription tiers, feature access checks, admin subscription management. |
| `/api/marketplace` | Newer marketplace listings, stores, conversations, messages, sales, reviews, admin store controls. |
| `/api/mobile` | Mobile QR, scan log, husbandry logs, tasks, sync queue endpoints. |
| `/api/admin` | Admin dashboard, users, reports, verification, lab accounts, GDPR, marketplace permissions, audit logs. |
| `/api/lab` | Lab test catalog and pricing configuration. |
| `/api/lab/orders` | Lab order pricing, creation, queues, status, payment, result drafts and finalization. |

## Recommended Backend Repository Structure

Target repository: `breeding-app-backend`.

```text
breeding-app-backend/
  src/
    app.ts
    server.ts
    config/
      env.ts
      cors.ts
    lib/
      prisma.ts
      logger.ts
    middleware/
      auth.ts
      roles.ts
      asyncHandler.ts
      errorHandler.ts
      requestId.ts
    modules/
      auth/
      users/
      profiles/
      breeders/
      snakes/
      pairings/
      clutches/
      spaces/
      labOrders/
      geneticTests/
      marketplace/
      messages/
      notifications/
      subscriptions/
      mobile/
      admin/
      auditLogs/
    shared/
      dto/
      validators/
      response.ts
    tests/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  package.json
  tsconfig.json
```

The current `routes/`, `controllers/`, and `services/` layout can be migrated incrementally into `modules/<domain>/` folders. During the split, avoid changing route behavior until frontend clients and shared contracts exist.

Recommended module shape:

```text
modules/<domain>/
  <domain>.routes.ts
  <domain>.controller.ts
  <domain>.service.ts
  <domain>.repository.ts
  <domain>.schemas.ts
  <domain>.types.ts
  <domain>.test.ts
```

## API Modules

| Module | Responsibility | Current source |
| --- | --- | --- |
| `auth` | Register, login, refresh, recover password, current user, token payload shape. | `authRoutes`, `authController`, `authService`, `jwt`, `authValidators`. |
| `users` | User status, role, profile link, subscription state, admin-managed user lifecycle. | `adminService`, `profileService`, Prisma `User`. |
| `profiles` | Breeder/seller public profile data and current profile updates. | `profileRoutes`, `profileController`, `Profile`. |
| `breeders` | Breeder account ownership, breeder snapshot boundaries, breeder verification status. | `breederDataRoutes`, `Profile`, `VerificationRequest`. |
| `snakes` | Canonical animal records, breeder-owned animal payloads, future structured genetics. | `Animal`, breeder snapshot service. |
| `pairings` | Pairing records, clutch links, breeding project ownership. | `Pairing`, `Clutch`, breeder snapshot service. |
| `spaces` | Rooms, racks, tubs, and husbandry location data. | Currently mostly inside breeder snapshot payloads; should become structured tables later. |
| `labOrders` | Lab order creation, queues, status, payment state, results. | `orderRoutes`, `orderService`, `ShedTestOrder*`. |
| `geneticTests` | Test catalog, pricing config, lab result values, certificate input data. | `labRoutes`, `labConfigService`, `ShedTestCatalog`, `PricingConfig`. |
| `marketplace` | Listings, stores, favorites, conversations, sales, reviews, public/private field filtering. | `marketplaceRoutes`, `listingRoutes`, marketplace models. |
| `messages` | Marketplace conversations, inquiries, notifications. | `MarketplaceConversation`, `MarketplaceMessage`, `ListingInquiry`, `Notification`. |
| `subscriptions` | Tier catalog, feature access, usage tracking, admin overrides. | `subscriptionRoutes`, `subscriptionService`. |
| `mobile` | QR scan lookup, husbandry logs, offline sync queue, device sessions. | `mobileRoutes`, mobile models. |
| `admin` | Admin dashboard, moderation, reports, user control, verification, lab accounts, GDPR. | `adminRoutes`, `adminService`. |
| `auditLogs` | Admin audit records, listing moderation history, security-relevant events. | `AdminAuditLog`, `ListingModerationAudit`. |

## Authentication Strategy

Use the current JWT bearer token pattern as the starting point:

- Access token sent as `Authorization: Bearer <token>`.
- `requireAuth` validates the token and attaches `req.user`.
- Token payload contains `sub`, `email`, and `role`.
- Refresh flow remains under `/api/auth/refresh`.
- Password hashes stay backend-only.
- JWT signing and verification stay backend-only and must never move to shared frontend code.

Recommended improvements before the repo split:

- Store refresh tokens as hashed records, not a single plaintext token field on `User`.
- Add `UserDeviceSession` linkage for refresh/session revocation.
- Standardize token expiry, refresh rotation, and logout semantics.
- Move shared role names and serializable auth DTOs to `breeding-app-shared`; keep token signing code in backend.
- Keep separate frontend storage namespaces for breeder, lab, admin, and marketplace apps while using the same backend token format.

## Roles And Permissions

Current roles from Prisma and `server/src/types/auth.ts`:

- `admin`
- `lab`
- `breeder`
- `buyer`
- `moderator`
- `support`

Recommended permission model:

| Permission area | `admin` | `lab` | `breeder` | `buyer` | `moderator` | `support` |
| --- | --- | --- | --- | --- | --- | --- |
| Manage all users and roles | Yes | No | No | No | No | Limited read only if added. |
| Admin audit logs | Yes | No | No | No | No | Limited read only if added. |
| Own breeder animals, pairings, clutches | Yes for support/admin actions | No | Own records only | No | No | Read by support policy only. |
| Lab order creation | Optional/admin | No | Own orders only | No | No | No |
| Lab order processing/results | Yes | Yes | Own order read only | No | No | No |
| Test catalog/pricing edits | Yes | Yes if permitted | No | No | No | No |
| Marketplace browsing | Yes | Yes if needed | Yes | Yes | Yes | Yes |
| Marketplace selling | Yes | No | Yes if marketplace permission allows | No | No | No |
| Marketplace messaging | Yes by admin tooling | No | Own conversations | Own conversations | Moderation read if added | Support read if added |
| Moderation actions | Yes | No | No | No | Yes if promoted from role-only plan | No |
| Subscription management | Yes | No | Own access read only | Own access read only | No | Support read if added |

Authorization rules must be enforced in service/repository code as well as route middleware. Route guards stop broad access; ownership checks stop cross-tenant data leaks.

## Important API Routes

Keep route names stable while extracting frontends. The following route surface should be treated as the shared contract.

### Auth

| Route | Apps |
| --- | --- |
| `POST /api/auth/register` | Breeder, Marketplace buyer/seller onboarding. |
| `POST /api/auth/login` | All apps. |
| `POST /api/auth/refresh` | All apps. |
| `POST /api/auth/recover-password` | All apps. |
| `GET /api/auth/me` | All apps. |

### Breeder

| Route | Apps |
| --- | --- |
| `GET /api/breeder/snapshot` | Breeder app, Admin support tooling. |
| `PUT /api/breeder/snapshot` | Breeder app, Admin support tooling only with audit trail. |
| `GET /api/profiles/me` | Breeder, Marketplace, Lab as needed. |
| `PUT /api/profiles/me` | Breeder, Marketplace seller profile. |

### Lab

| Route | Apps |
| --- | --- |
| `GET /api/lab/tests/catalog` | Breeder, Lab, Admin. |
| `GET /api/lab/tests/pricing` | Breeder, Lab, Admin. |
| `PATCH /api/lab/tests/catalog/:id` | Lab, Admin. |
| `PATCH /api/lab/pricing/:id` | Lab, Admin. |
| `POST /api/lab/orders/calculate-price` | Breeder, Lab, Admin. |
| `POST /api/lab/orders` | Breeder. |
| `GET /api/lab/orders` | Breeder own orders; Lab/Admin all permitted queues. |
| `GET /api/lab/orders/:id` | Breeder own orders; Lab/Admin permitted orders. |
| `PATCH /api/lab/orders/:id/status` | Lab, Admin. |
| `PATCH /api/lab/orders/:id/payment` | Lab, Admin. |
| `POST /api/lab/orders/:id/results/draft` | Lab, Admin. |
| `POST /api/lab/orders/:id/results/submit` | Lab, Admin. |

### Marketplace

| Route | Apps |
| --- | --- |
| `GET /api/marketplace/listings` | Marketplace, Breeder, Admin. |
| `GET /api/marketplace/listings/:id` | Marketplace, Breeder, Admin. |
| `POST /api/marketplace/listings` | Marketplace seller, Breeder, Admin. |
| `PATCH /api/marketplace/listings/:id` | Listing owner, Admin. |
| `PATCH /api/marketplace/listings/:id/status` | Listing owner for allowed transitions, Admin for moderation. |
| `POST /api/marketplace/listings/:id/favorite` | Marketplace, Breeder, Buyer. |
| `GET /api/marketplace/stores/:userId` | Marketplace, Breeder, Admin. |
| `PUT /api/marketplace/seller/store` | Marketplace seller, Breeder, Admin. |
| `GET /api/marketplace/seller/dashboard` | Marketplace seller, Breeder, Admin. |
| `POST /api/marketplace/conversations` | Marketplace, Breeder, Buyer. |
| `GET /api/marketplace/conversations` | Conversation participants, Admin if moderation policy allows. |
| `POST /api/marketplace/conversations/:id/messages` | Conversation participants. |
| `POST /api/marketplace/sales` | Seller, Admin. |
| `POST /api/marketplace/reviews` | Buyer/seller participants, Admin if moderation policy allows. |
| `GET /api/searches` / `POST /api/searches` / `DELETE /api/searches/:id` | Marketplace, Breeder, Buyer. |
| `GET /api/notifications` / `PATCH /api/notifications/:id/read` | All authenticated apps for own notifications. |

### Admin

All `/api/admin/*` routes are admin-only in the current backend.

Important groups:

- Dashboard: `GET /api/admin/dashboard`
- Reports: `GET /api/admin/reports`, `GET /api/admin/reports/:id`, status/action updates
- Audit logs: `GET /api/admin/audit-logs`, `GET /api/admin/users/:id/audit-logs`
- Verification: `GET/PATCH /api/admin/verification-requests...`
- Users: `GET /api/admin/users`, `GET /api/admin/users/:id`, role/status/subscription/verification patches
- Marketplace permission: `GET/PATCH /api/admin/users/:id/marketplace-permission`
- Lab accounts: `GET /api/admin/lab-accounts`, `PATCH /api/admin/lab-accounts/:id`
- GDPR: `GET /api/admin/gdpr-requests`, `POST /api/admin/users/:id/gdpr-requests`, `PATCH /api/admin/gdpr-requests/:id`
- Notifications: `POST /api/admin/notifications/send`

### Subscriptions

| Route | Apps |
| --- | --- |
| `GET /api/subscriptions/public/tiers` | All apps, public pricing pages. |
| `GET /api/subscriptions/access` | All authenticated apps. |
| `GET /api/subscriptions/access/:featureKey` | All authenticated apps. |
| `/api/subscriptions/admin/*` | Admin only. |

### Mobile

Mobile routes should be reviewed before split because several current endpoints are not guarded by `requireAuth`.

Target rules:

- QR scan lookup may allow signed/opaque public QR tokens only.
- Husbandry logs, sync, device sessions, and task queues must require authentication.
- Every write must be scoped to the authenticated owner and device session.

## App Route Access Matrix

| App | Allowed route families |
| --- | --- |
| Breeder | `/api/auth`, own `/api/breeder`, own `/api/profiles`, lab catalog/pricing, create/read own lab orders, marketplace seller/buyer routes, own subscriptions/access, own notifications, authenticated mobile/device routes. |
| Lab | `/api/auth`, lab catalog/pricing, lab order queues and result routes, own profile if lab account profiles remain, subscription access if needed. |
| Marketplace | `/api/auth`, marketplace listings/stores/conversations/messages/sales/reviews, searches, notifications, profile routes, subscription access. |
| Admin | `/api/auth`, `/api/admin`, subscription admin routes, marketplace admin routes, lab admin routes, support access to breeder/lab/marketplace records through explicit admin endpoints only. |

## Database Tables Needed

The current Prisma schema already includes many required tables:

- Auth/users: `User`, `Profile`, `UserDeviceSession`
- Breeder planner: `Animal`, `Pairing`, `Clutch`
- Legacy/current listing flow: `Listing`, `ListingInquiry`, `SavedSearch`, `Notification`, `ListingModerationAudit`
- Admin/moderation: `AdminAuditLog`, `Report`, `VerificationRequest`, `MarketplacePermission`, `LabAccount`, `GdprRequest`
- Subscriptions: `SubscriptionTier`, `FeatureCatalog`, `TierFeature`, `UserSubscription`, `UserFeatureOverride`, `UsageTracking`
- Mobile: `MobileScanLog`, `MobileSyncQueue`
- Marketplace: `MarketplaceListing`, `MarketplaceListingImage`, `MarketplaceStore`, `MarketplaceConversation`, `MarketplaceMessage`, `MarketplaceFavorite`, `MarketplaceSale`, `MarketplaceReview`
- Lab: `ShedTestCatalog`, `PricingConfig`, `ShedTestOrder`, `ShedTestOrderAnimal`, `ShedTestOrderAnimalTest`, `ShedTestOrderResult`

Tables likely needed during or after split:

- `BreederAccount` or richer `Profile` fields for breeder organization ownership.
- Structured `SnakeGeneticTrait` or `AnimalGenetics` table instead of genetics only inside `Animal.payload`.
- `Space`, `Room`, `Rack`, `Tub`, and `AnimalLocationHistory` tables instead of spaces only inside snapshot JSON.
- `HusbandryEvent` for feed, weight, shed, clean, water, notes, and mobile logs.
- `LabSample` for QR/sample tracking independent of order animal rows.
- `LabCertificate` for finalized certificate metadata and immutable PDF references.
- `PaymentTransaction` for subscription, lab order, and marketplace payment provider events.
- `RefreshTokenSession` if refresh token storage moves out of `User.refreshToken`.

## Security Rules

- Enforce HTTPS in production and restrict CORS to known app origins.
- Keep `DATABASE_URL`, `JWT_SECRET`, payment secrets, and provider credentials backend-only.
- Validate every request with shared-compatible schemas, but enforce validation in backend even if frontend also validates.
- Apply route role guards and service-level ownership checks.
- Never trust frontend-supplied `ownerId`, `breederId`, `sellerUserId`, `adminUserId`, or payment status.
- Keep marketplace public/private field mapping in backend services.
- Keep subscription entitlement decisions and usage writes in backend services.
- Audit all admin mutations, moderation actions, role changes, subscription overrides, lab result finalization, and payment changes.
- Rate-limit auth endpoints and any public QR/token lookup endpoint.
- Return consistent error shapes without leaking stack traces or private data.
- Treat QR codes and lab sample IDs as opaque identifiers; do not encode secrets in client-readable values.

## Environment Variables

Current required variables:

- `DATABASE_URL`
- `JWT_SECRET`

Current optional variables:

- `NODE_ENV`
- `PORT`
- `CORS_ORIGIN`

Recommended future variables:

- `JWT_ACCESS_TOKEN_TTL`
- `JWT_REFRESH_TOKEN_TTL`
- `REFRESH_TOKEN_PEPPER`
- `APP_PUBLIC_ORIGINS`
- `BREEDER_APP_ORIGIN`
- `ADMIN_APP_ORIGIN`
- `LAB_APP_ORIGIN`
- `MARKETPLACE_APP_ORIGIN`
- `PAYMENT_PROVIDER`
- `PAYMENT_WEBHOOK_SECRET`
- `PAYMENT_API_KEY`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_API_KEY`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `LOG_LEVEL`
- `SENTRY_DSN` or equivalent error reporting DSN

## Migration Strategy From Current Database Code

1. Freeze route behavior and document current request/response contracts before extracting frontend apps.
2. Move shared serializable DTOs, role constants, API error shape, and validators into `breeding-app-shared`.
3. Keep Prisma, migrations, seeds, and all direct database access in `breeding-app-backend`.
4. Convert the current route/controller/service folders into domain modules one route family at a time.
5. Add contract tests for auth, breeder snapshot, lab orders, marketplace listing/conversation flows, subscriptions, and admin user/moderation flows.
6. Split legacy `Listing` and newer `MarketplaceListing` responsibilities deliberately; do not remove one until all clients have migrated.
7. Replace large JSON snapshot areas with structured tables only after import/export and ownership tests exist.
8. Add explicit ownership checks to every endpoint that currently relies only on `requireAuth`.
9. Review mobile routes and add auth or signed-token constraints before exposing them as a standalone mobile/backend contract.
10. Deploy migrations through `prisma migrate deploy`; avoid direct schema edits in production.

## Immediate Split Risks

- Breeder planner data is still partly stored as JSON payload snapshots, so backend cannot yet enforce every animal/pairing/space rule structurally.
- Lab status constants exist in both frontend and backend areas; shared enum contracts must be centralized before splitting apps.
- Marketplace has both legacy `Listing` tables and newer `MarketplaceListing` tables; API clients need a clear migration boundary.
- Admin routes are well guarded at the route level, but admin actions still need complete audit coverage when split into a standalone admin app.
- Mobile routes need authentication/authorization review before becoming a public cross-app surface.
