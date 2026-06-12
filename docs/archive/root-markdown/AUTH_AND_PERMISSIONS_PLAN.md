# Auth And Permissions Plan

Planning document for authentication and permissions in the split Breeding Planner platform. No auth code should be changed as part of this step.

## Goal

Use one account system across:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`

All apps authenticate against `breeding-app-backend`. The backend enforces roles, ownership, subscription access, marketplace permissions, and lab permissions. Frontend route guards are only for navigation and UX.

## Current State

Current backend roles in `server/prisma/schema.prisma` and `server/src/types/auth.ts`:

- `admin`
- `lab`
- `breeder`
- `buyer`
- `moderator`
- `support`

Current frontend/lab code also uses:

- `lab_staff` in `src/features/lab/auth/roleGuard.ts`
- `admin`, `breeder`, and `unknown` for lab app gating

Current token storage scopes in `src/shared/apiClient.ts`:

- `breeder`
- `lab`
- `admin`

Current backend enforcement examples:

- `server/src/middleware/auth.ts` validates Bearer tokens.
- `server/src/middleware/roles.ts` enforces role lists.
- Admin routes require `admin`.
- Lab order routes allow combinations of `admin`, `lab`, and `breeder`.
- Marketplace listing creation allows `admin` and `breeder`.
- Buyer inquiry and saved search services enforce ownership.

## Recommended Role Model

Use stable shared role constants and map current roles during migration.

| Target role | Current equivalent | Purpose |
| --- | --- | --- |
| `super_admin` | New | Platform owner role with break-glass access and user/admin management. |
| `admin` | `admin` | Operations, moderation, support escalation, subscriptions, user management. |
| `breeder` | `breeder` | Breeder planner, seller tools, breeder-side lab orders. |
| `lab_owner` | New or `lab` with owner flag | Owns a lab account, manages catalog/pricing/staff/settings. |
| `lab_staff` | Current frontend `lab_staff`; backend currently `lab` | Handles lab orders, intake, results, labels, certificates. |
| `buyer` | `buyer` | Marketplace browsing, inquiries, saved searches, purchases, messages. |
| `viewer` | New | Read-only invited/account-level viewer for breeder or lab data. |
| `moderator` | `moderator` | Marketplace/report moderation if kept separate from admin. |
| `support` | `support` | Support tooling without full admin power. |

Migration decision required: either rename backend `lab` to `lab_staff`, or keep persisted `lab` and expose a shared alias that resolves to `lab_staff` in app UI. The long-term recommendation is to make persisted roles explicit: `lab_owner` and `lab_staff`.

## App Access By Role

| Role | Breeder app | Admin app | Lab app | Marketplace app |
| --- | --- | --- | --- | --- |
| `super_admin` | Yes | Yes | Yes | Yes |
| `admin` | Yes for support/impersonation-safe views | Yes | Yes for oversight | Yes for moderation |
| `breeder` | Yes | No | Breeder-facing order submission/status only | Yes as seller and buyer |
| `lab_owner` | No by default | No | Yes, including lab admin settings | Buyer-only unless separate breeder/seller permissions exist |
| `lab_staff` | No by default | No | Yes, operational lab workflows | Buyer-only |
| `buyer` | No | No | No | Yes |
| `viewer` | Scoped read-only access only | No | Scoped read-only only if invited | Public/buyer read-only |
| `moderator` | No | Limited moderation console or admin app subset | No | Moderation APIs only |
| `support` | Limited support views | Limited support console | Limited read-only support | Limited support views |

## Route Permissions

### Breeder app

- Public routes: launch, pricing, login, registration, password recovery.
- `breeder`: animals, pairings, clutches, incubator, hatchlings, labels, spaces, calendar, import/export, breeder dashboard, breeder lab order submission.
- `viewer`: read-only breeder routes for specifically shared breeder data.
- `admin` and `super_admin`: support access only through audited backend flows, not ordinary local storage role spoofing.

### Admin app

- `admin`: user management, reports, moderation queue, breeder verification, subscription controls, audit review, support operations.
- `super_admin`: all admin routes plus admin role assignment and break-glass controls.
- `moderator`: marketplace/report moderation subset if this role remains separate.
- `support`: support subset without role changes, destructive moderation, or billing overrides.
- Everyone else: no access.

### Lab app

- `lab_owner`: dashboard, order queue, sample intake, result entry, finalization, catalog/pricing settings, staff management, labels, certificates.
- `lab_staff`: dashboard, order queue, intake, result entry, finalization, labels, certificates.
- `admin` and `super_admin`: oversight and support access.
- `breeder`: no lab staff shell access; use breeder-facing order submission/status routes only.
- `buyer`: no lab access.

### Marketplace app

- Public: browse approved public listings, public seller profiles, public-safe listing details.
- `buyer`: inquiries, saved searches, favorites, messages, purchases/reviews where supported.
- `breeder`: buyer features plus seller dashboard, listings, store profile, sales, seller messages.
- `admin`, `super_admin`, `moderator`: moderation views and moderation actions through admin/moderation APIs.

## API Permissions

Backend should express permissions as policies, not scattered role checks.

Recommended policy examples:

```text
auth.login: public
auth.refresh: valid refresh token
breeder.snapshot.read: owner, admin, super_admin, scoped viewer
breeder.snapshot.write: owner breeder, admin support action
lab.order.create: breeder, admin, super_admin
lab.order.read: order owner breeder, lab staff assigned to lab, lab owner, admin
lab.order.status.update: lab_staff, lab_owner, admin
lab.result.draft: lab_staff, lab_owner, admin
lab.result.finalize: lab_staff, lab_owner, admin
marketplace.listing.public.read: public approved listings only
marketplace.listing.create: breeder with seller entitlement, admin
marketplace.listing.update: owner seller, admin
marketplace.inquiry.create: buyer or breeder acting as buyer, not listing owner unless explicitly allowed
marketplace.inquiry.read: buyer, listing owner seller, admin
admin.users.read: admin, super_admin, support subset
admin.users.role.update: super_admin or tightly controlled admin policy
subscriptions.override.write: admin, super_admin
```

Current `requireRole(...)` middleware can remain as a coarse guard, but domain services must also enforce ownership and feature permissions.

## Database Ownership Rules

- `User`, auth tokens, roles, profiles, subscriptions, and feature overrides are platform-owned.
- Breeder data rows belong to the breeder user/account that created them.
- Lab orders belong to the breeder who submitted the order and the lab account processing it.
- Lab results belong to the lab account operationally, but breeder users can read their own finalized results.
- Marketplace listings belong to seller users/accounts.
- Marketplace inquiries, conversations, messages, sales, favorites, saved searches, and notifications are visible only to participants and authorized admins.
- Admin reports, audit logs, moderation actions, verification requests, and subscription overrides are admin-owned operational records.
- Every query must include owner, participant, lab account, or admin permission filters.
- Deleting or exporting user data must account for all owned domains.

## Admin Override Rules

- Admin override is not the same as ownership. It should be explicit, audited, and limited by role.
- `super_admin` may assign roles, manage admins, and perform break-glass access.
- `admin` may moderate users/listings/reports, manage subscriptions, review verification, and support accounts.
- `moderator` should be limited to marketplace/report actions if retained.
- `support` should not change roles, delete data, finalize lab results, or override billing unless explicitly granted.
- All admin/moderation actions should write audit logs with actor, target, before/after values, reason, timestamp, and request metadata.
- Admin support access to breeder/lab/marketplace data should use backend-mediated views, not shared frontend token storage shortcuts.

## Lab Access Rules

- Long term, add `LabAccount` membership with role per lab: owner, manager, staff, viewer.
- `lab_owner` can manage lab settings, catalog, pricing, staff, and result workflows.
- `lab_staff` can intake samples, update order workflow, draft results, finalize results if allowed by lab policy, print labels/certificates.
- Breeders can create orders, see their own order statuses, see pricing estimates, pay invoices, and read their own finalized results.
- Breeders cannot see other breeders' orders or lab internal queues.
- Buyers cannot access lab data.
- Admin/super admin can oversee lab operations through audited support paths.
- Backend must enforce lab account membership, not just the top-level user role.

## Marketplace Public And Private Boundaries

Public:

- Approved listing summary/detail fields.
- Public seller profile fields such as breeder name, public location, public contact preference, store profile, and verification badge.
- Public search/filter metadata.

Private/authenticated:

- Draft, hidden, rejected, or seller-only listing fields.
- Seller dashboard metrics.
- Buyer inquiries and seller responses.
- Conversations, messages, notifications, saved searches, favorites, sales, reviews before publication rules allow display.
- Breeder private collection data that is not intentionally copied into a listing.
- Moderation/audit data.

Rules:

- Public mapping must be done by backend services.
- Frontend DTOs should not include private fields for public endpoints.
- Marketplace write APIs must check seller ownership, buyer participation, and subscription/feature access.

## Subscription And Tier Permissions

Shared package should define feature keys and display metadata. Backend remains the authority for access.

Example feature keys:

```text
breeder.animals.max
breeder.pairings.max
breeder.labels.pdf
breeder.google_calendar_sync
lab.orders.create
lab.results.finalize
marketplace.create_listing
marketplace.listings.max
marketplace.featured_listing
marketplace.messaging
admin.subscription.override
```

Rules:

- Backend checks `canAccessFeature` before creating listings, using premium breeder tools, using lab paid workflows, or applying subscription-limited actions.
- Frontend guards may hide or disable UI, but they do not grant access.
- Admin overrides must be audited.
- Usage counters must be written server-side.

## Recommended Implementation Approach

1. Create shared role, app surface, auth scope, and permission constants in `breeding-app-shared`.
2. Resolve the `lab` versus `lab_staff` mismatch before app extraction.
3. Replace scattered frontend role strings with shared constants.
4. Replace direct route role checks with shared route permission maps for frontend navigation.
5. Keep backend `requireAuth` and `requireRole` as coarse middleware, then add domain policy helpers for ownership and feature gates.
6. Add a backend permission layer such as `can(actor, action, resource)` for admin, lab, marketplace, breeder, and subscription-sensitive operations.
7. Add lab account membership checks before expanding lab owner/staff roles.
8. Ensure public marketplace serializers return only public-safe DTOs.
9. Audit log all role changes, subscription overrides, moderation actions, admin data access, lab result finalization, and destructive operations.
10. Add integration tests for each app surface and role.

## Minimum Test Coverage Before Split

- Registration and login for breeder and buyer.
- Admin-only route rejection for breeder, buyer, lab staff, and unauthenticated users.
- Lab app access for lab staff/admin and rejection for buyer/breeder staff shell.
- Breeder order creation allowed for breeder and rejected for buyer.
- Lab result finalization allowed for lab/admin and rejected for breeder/buyer.
- Marketplace listing create allowed for breeder with entitlement and rejected for buyer.
- Marketplace inquiry access limited to buyer, seller, and admin.
- Saved search/notification ownership checks.
- Subscription feature gate tests.
- Admin role-change audit log tests.

## Risks

- Role names are not consistent today: backend uses `lab`, instructions suggest `lab_owner`/`lab_staff`, and lab frontend uses `lab_staff`.
- Frontend route guards currently read local storage session role values, which is useful for UX but not trustworthy for enforcement.
- Admin and marketplace share moderation and subscription data; permissions must be centralized to avoid drift.
- Lab and breeder share order/result visibility but not operational permissions.
- Public marketplace DTOs must not leak private breeder collection fields.
- Subscription access must never be decided by frontend-only checks.
- Introducing `super_admin`, `viewer`, `lab_owner`, `moderator`, and `support` requires a migration plan for existing users and tests around every route group.
