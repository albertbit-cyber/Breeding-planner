# Admin Repo Extraction Plan

Target repository: `breeding-app-admin`

This plan covers the internal admin app only. It is a planning document; no source files are moved in this step.

## Scope

The admin app should contain:

- Admin dashboard.
- User management.
- Breeder verification and breeder management.
- Lab account management.
- Marketplace moderation.
- Subscription and tier management.
- Global settings and support tools.
- Reports, safety actions, GDPR tools, notifications, and audit log viewer.
- API connection to the shared backend.

## Existing Admin Files And Folders

Frontend:

- `src/admin/AdminApp.jsx`
- `src/AuthShell.jsx`, until replaced by an admin-only router/entry.
- `src/shared/apiClient.ts`, admin functions and core auth/API pieces only.
- `src/features/auth/AuthGate.jsx`
- `src/contexts/SharedBackendContext.jsx`
- `src/components/SharedBackendBanner.jsx`
- `src/components/SharedBackendGuard.jsx`
- `src/contexts/AppearanceContext.jsx`, if admin keeps shared appearance settings.
- `src/components/LanguageSwitcher.jsx`, if admin keeps shared i18n.
- `src/i18n/*` and `src/locales/*`, filtered to admin/shared keys.
- `src/features/marketplace/MarketplacePage.jsx`, currently reused in `portalMode="admin"` for `/admin/marketplace`; should be replaced by admin-owned moderation screens.

Backend dependencies to keep in `breeding-app-backend`:

- `server/src/routes/adminRoutes.ts`
- `server/src/controllers/adminController.ts`
- `server/src/services/adminService.ts`
- `server/src/middleware/auth.ts`
- `server/src/middleware/roles.ts`
- `server/src/services/subscriptionService.ts`
- `server/src/services/subscriptionCatalog.ts`
- Marketplace/listing/lab/profile services used by admin views.
- Prisma admin/report/audit/subscription/verification migrations and schema models.

## Missing Admin Features

Current `AdminApp.jsx` has active coverage for dashboard, users, user detail, subscriptions, reports, breeder verification, lab accounts, notifications, GDPR tools, and marketplace moderation through a shared marketplace page. Gaps to address in the extracted admin repo:

- Dedicated marketplace moderation UI instead of reusing public/seller marketplace page code.
- Dedicated audit log viewer route and filters, even though `/api/admin/audit-logs` exists.
- Global settings route for platform-level configuration.
- Support tools route for impersonation-safe diagnostics, user timeline, and ticket handoff.
- Moderator/support role access model if non-admin users should have partial admin access; current frontend requires role exactly `admin`.
- Stronger route-level permission matrix for admin, moderator, and support roles.
- System health/status page that uses backend health plus service metadata.
- Bulk actions with reason/audit capture for user/report/listing workflows.

## Routes And Pages Needed

Extract these admin routes:

- `/admin`: dashboard.
- `/admin/users`: user list, filters, pagination.
- `/admin/users/:id`: user detail, role/status/verification/subscription actions, audit history.
- `/admin/verification`: breeder verification queue.
- `/admin/labs`: lab account management.
- `/admin/marketplace`: listing moderation and seller/store controls.
- `/admin/reports`: reports and safety actions.
- `/admin/reports/:id`: report detail.
- `/admin/tiers`: subscription tier overview.
- `/admin/tiers/new`: create tier.
- `/admin/tiers/:id`: tier editor.
- `/admin/notifications`: announcements and targeted notifications.
- `/admin/audit-logs`: audit log viewer.
- `/admin/gdpr`: data export, anonymization, and deletion request tools.
- `/admin/settings`: global settings and role/permission configuration.
- `/admin/support`: support diagnostics.

## Shared Code Dependencies

Move to or consume from `breeding-app-shared`:

- Auth scopes, token storage, role constants, API error shape, and API base URL config.
- Admin DTOs and constants for roles, user statuses, report types/statuses/actions, verification statuses, lab account statuses, and marketplace permission keys.
- Subscription feature catalog, tier DTOs, override DTOs, and usage DTOs.
- Marketplace moderation DTOs and public/private listing field definitions.
- Backend status provider/guard and shared UI primitives.
- Appearance/i18n primitives if admin keeps the same shell.

Keep backend-only:

- JWT signing/verification.
- Role enforcement middleware.
- Admin action authorization.
- Audit log writes.
- Subscription entitlement decisions and usage writes.
- Marketplace public/private field filtering.
- Prisma client, schema, and migrations.

## Backend API Dependencies

Admin frontend endpoints:

- `GET /api/health`
- `/api/auth/*`
- `GET /api/admin/dashboard`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id/role`
- `PATCH /api/admin/users/:id/status`
- `PATCH /api/admin/users/:id/subscription`
- `PATCH /api/admin/users/:id/verification`
- `GET /api/admin/users/:id/audit-logs`
- `GET /api/admin/reports`
- `GET /api/admin/reports/:id`
- `PATCH /api/admin/reports/:id/status`
- `POST /api/admin/reports/:id/action`
- `GET /api/admin/audit-logs`
- `GET /api/admin/verification-requests`
- `GET /api/admin/verification-requests/:id`
- `PATCH /api/admin/verification-requests/:id`
- `PATCH /api/admin/verification-requests/:id/approve`
- `PATCH /api/admin/verification-requests/:id/reject`
- `PATCH /api/admin/verification-requests/:id/request-more-info`
- `PATCH /api/admin/verification-requests/:id/revoke`
- `GET /api/admin/users/:id/marketplace-permission`
- `PATCH /api/admin/users/:id/marketplace-permission`
- `GET /api/admin/lab-accounts`
- `PATCH /api/admin/lab-accounts/:id`
- `POST /api/admin/notifications/send`
- `GET /api/admin/gdpr-requests`
- `POST /api/admin/users/:id/gdpr-requests`
- `PATCH /api/admin/gdpr-requests/:id`
- `GET /api/subscriptions/admin/features`
- `GET /api/subscriptions/admin/tiers`
- `POST /api/subscriptions/admin/tiers`
- `GET /api/subscriptions/admin/tiers/:id`
- `PATCH /api/subscriptions/admin/tiers/:id`
- `POST /api/subscriptions/admin/tiers/:id/duplicate`
- `POST /api/subscriptions/admin/tiers/:id/archive`
- `GET /api/subscriptions/admin/users/:id/subscription`
- `PATCH /api/subscriptions/admin/users/:id/subscription`
- `POST /api/subscriptions/admin/users/:id/overrides`
- `DELETE /api/subscriptions/admin/users/:id/overrides/:overrideId`
- `POST /api/subscriptions/admin/users/:id/usage/reset`
- Marketplace moderation endpoints under `/api/marketplace/admin` and `/api/listings/moderation*`.

## Permissions Required

Current backend requires authenticated `admin` role for all `/api/admin/*` routes and subscription admin routes.

Required permission model:

- `admin`: full access.
- `moderator`: marketplace moderation, reports, verification queues, and audit read access if backend allows it.
- `support`: user lookup, support timeline, notification/status tools with limited mutation rights if backend allows it.
- Lab account and subscription changes should remain admin-only unless explicit delegated permissions are added.
- Every mutation must require a reason/internal note where policy requires it and must create an audit log record.

## Environment Variables

Frontend:

- `VITE_API_URL`: required hosted backend base URL.
- Optional public app metadata variables for admin environment labels.

Do not include:

- `DATABASE_URL`
- `JWT_SECRET`
- Provider secrets.
- Prisma client or migration configuration.

Backend production must set strict CORS origins for the admin app domain.

## Build And Test Commands

Initial commands:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`
- `npm run typecheck`

Recommended admin-specific tests:

- Admin API client tests with mocked 401/403 responses.
- Route guard tests for admin/moderator/support role behavior.
- User action forms requiring reason fields.
- Subscription tier editor validation.
- Marketplace moderation action state transitions.

## Risks

- `AdminApp.jsx` embeds many constants and page implementations in one file; extract into feature modules before repo split.
- Current frontend blocks all non-admin roles while target scope mentions moderator/support tools.
- Admin marketplace view currently reuses `MarketplacePage`, which mixes buyer, seller, and admin behavior.
- Admin and marketplace share moderation/reporting data; contracts must be shared, but enforcement stays backend-owned.
- Admin actions are high risk and must not rely on frontend-only checks.

## Cleanup Tasks

- Split `AdminApp.jsx` into dashboard, users, subscriptions, reports, verification, labs, notifications, GDPR, audit, marketplace moderation, and settings modules.
- Move embedded constants into shared admin/subscription/marketplace contract modules.
- Replace reused public marketplace page with admin-owned moderation components.
- Add an audit log viewer route.
- Remove breeder/lab/public marketplace screens from the admin repo.
- Keep server code, Prisma schema, migrations, generated artifacts, and secrets out of this frontend repo.
