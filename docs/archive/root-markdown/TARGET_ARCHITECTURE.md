# Target Architecture

Generated from `02_define_target_architecture.md` and `CODEBASE_SPLIT_AUDIT.md`.

## Architecture Goal

Split the current combined Breeding Planner repository into four frontend application repositories, one shared backend/API repository, one shared database, and one shared package repository.

The target system should keep business rules, authentication, genetics logic, API contracts, and database access centralized instead of duplicating them across apps.

## Repository List

| Repository | Required | Purpose |
| --- | --- | --- |
| `breeding-app-breeder` | Yes | Breeder-facing planner app for animals, pairings, clutches, incubator, labels, calendar, spaces, and breeder-side lab ordering. |
| `breeding-app-admin` | Yes | Admin and moderation app for users, subscriptions, reports, marketplace controls, verification, and support operations. |
| `breeding-app-lab` | Yes | Lab/genetic testing app for order intake, sample tracking, result entry, test catalog, pricing, labels, certificates, and lab dashboards. |
| `breeding-app-marketplace` | Yes | Marketplace app for listings, buyer/seller flows, seller dashboard, inquiries, saved searches, messages, stores, sales, reviews, and notifications. |
| `breeding-app-backend` | Yes | Shared Express/Prisma API used by every frontend app. Owns direct database access. |
| `breeding-app-shared` | Yes | Shared TypeScript package for API client, auth contracts, genetics logic, labels, types, validation, and UI primitives that must remain identical across apps. |

## High-Level System

```text
breeding-app-breeder       \
breeding-app-admin          \
breeding-app-lab             >  breeding-app-backend  >  shared PostgreSQL database
breeding-app-marketplace    /

All frontend apps also consume breeding-app-shared.
```

Frontend apps must never connect directly to the database. They communicate only with `breeding-app-backend` through authenticated HTTPS API calls.

## Repository Responsibilities

### `breeding-app-breeder`

Purpose:

- Daily breeder workflow app.
- Owns the breeder user experience, local planner screens, animal data entry, and breeding workflow UI.

Features:

- Animal collection management.
- Add/edit animal floating cards and image display.
- Free text animal import using shared parser.
- Pairings and breeding projects.
- Clutches, incubator, egg boxes, hatchlings, bad egg counts, clutch cards, and egg box notes.
- QR label generation and QR import.
- Pairing QR labels and PDF exports.
- Calendar and Google Calendar integration.
- Spaces, rooms, racks, tubs, and husbandry tracking.
- Breeder dashboard and active/completed project views.
- Breeder-side genetic test ordering.
- Breeder snapshot sync through shared backend.
- Appearance, accessibility, and language settings using shared components.

Recommended folder structure:

```text
breeding-app-breeder/
  src/
    app/
      App.tsx
      routes.tsx
      providers.tsx
    features/
      animals/
      pairings/
      clutches/
      incubator/
      hatchlings/
      labels/
      spaces/
      calendar/
      importExport/
      settings/
      breederLabOrders/
    components/
    hooks/
    styles/
    tests/
  public/
  electron/
  android/
  ios/
  package.json
  vite.config.ts
```

Notes:

- Electron and mobile packaging can stay here if the breeder app remains the main installed app.
- Clutch/egg box numbering and egg count logic should be imported from `breeding-app-shared`, not reimplemented.

### `breeding-app-admin`

Purpose:

- Internal operations app for platform administrators, moderators, support, and subscription management.

Features:

- Admin login and role-based access.
- User search and user management.
- Reports and moderation queue.
- Marketplace moderation and listing review.
- Breeder verification requests.
- Marketplace permissions.
- Subscription plans, overrides, billing/payment status, usage review.
- Admin audit logs.
- Support tooling and high-level system status.

Recommended folder structure:

```text
breeding-app-admin/
  src/
    app/
      App.tsx
      routes.tsx
      providers.tsx
    features/
      dashboard/
      users/
      reports/
      marketplaceModeration/
      verification/
      subscriptions/
      auditLogs/
      support/
    components/
    hooks/
    styles/
    tests/
  public/
  package.json
  vite.config.ts
```

Notes:

- Admin UI should not contain marketplace business logic directly; it should call admin/moderation API endpoints.
- Admin authorization rules must be enforced by backend roles, not by frontend checks alone.

### `breeding-app-lab`

Purpose:

- Lab team workflow app for shed/genetic testing operations.

Features:

- Lab dashboard.
- Incoming order queue.
- Order details.
- Sample intake.
- QR scanning and QR lookup.
- Result entry and inline result entry.
- Result finalization.
- Completed tests.
- Test catalog management.
- Pricing logic management.
- Shipment labels.
- Lab sample labels.
- Certificates.
- Admin oversight inside the lab domain.
- Batch order handling where lab users need it.

Recommended folder structure:

```text
breeding-app-lab/
  src/
    app/
      App.tsx
      routes.tsx
      providers.tsx
    features/
      dashboard/
      orders/
      intake/
      results/
      catalog/
      pricing/
      labels/
      certificates/
      qr/
      oversight/
    components/
    hooks/
    styles/
    tests/
  public/
  package.json
  vite.config.ts
```

Notes:

- Lab PDF label and certificate rendering should either live here or in `breeding-app-shared` if breeder/admin also need the exact same generation code.
- Genetics update behavior must come from shared genetics/domain logic.

### `breeding-app-marketplace`

Purpose:

- Marketplace app for buyers and sellers.

Features:

- Public marketplace listings.
- Listing search, filtering, sorting, and saved searches.
- Buyer inquiry flow.
- Seller dashboard.
- Listing create/edit workflow.
- Messaging/conversations.
- Favorites.
- Stores.
- Sales.
- Reviews.
- Notifications.
- Seller profile and verification display.

Recommended folder structure:

```text
breeding-app-marketplace/
  src/
    app/
      App.tsx
      routes.tsx
      providers.tsx
    features/
      listings/
      search/
      sellerDashboard/
      inquiries/
      messages/
      favorites/
      stores/
      sales/
      reviews/
      notifications/
      profiles/
    components/
    hooks/
    styles/
    tests/
  public/
  package.json
  vite.config.ts
```

Notes:

- Marketplace should consume shared animal/genetics display helpers so listings show morphs, hets, and IDs consistently with the breeder app.
- Moderation actions remain in admin/backend APIs, not in marketplace frontend business logic.

### `breeding-app-backend`

Purpose:

- Single shared API and single owner of database access.

Responsibilities:

- Authentication and refresh tokens.
- Role-based authorization.
- User and profile management.
- Breeder data sync APIs.
- Animal, pairing, clutch, and listing persistence APIs.
- Lab order, catalog, pricing, result, payment, label, and certificate APIs.
- Marketplace listing, inquiry, saved search, notification, message, favorite, sale, review, and store APIs.
- Admin, moderation, report, audit, subscription, verification, and support APIs.
- Mobile sync APIs.
- Prisma schema and migrations.
- Backend validation and API contract enforcement.
- Rate limiting, CORS, logging, security headers, and error handling.

Recommended folder structure:

```text
breeding-app-backend/
  src/
    app.ts
    server.ts
    config/
    lib/
      prisma.ts
    middleware/
      auth.ts
      roles.ts
      errorHandler.ts
      rateLimit.ts
    modules/
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.validators.ts
      breeder/
      lab/
      marketplace/
      admin/
      subscriptions/
      mobile/
      notifications/
      profiles/
    shared/
      errors.ts
      validators.ts
      pagination.ts
    tests/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  package.json
```

Notes:

- The backend must own all direct Prisma calls.
- Frontend repos must not include Prisma client code.
- Backend tests should be organized by module.

### `breeding-app-shared`

Purpose:

- Shared TypeScript package consumed by all frontend apps and, where safe, the backend.

Responsibilities:

- Shared types and DTOs.
- API client core.
- API endpoint contracts.
- Auth token helpers and role constants.
- Genetics gene library.
- Morph alias normalization.
- Het parsing and animal quick-add parsing.
- Clutch, egg box, and hatchling pure business rules.
- Label presets and sizing rules.
- PDF-safe layout helpers where shared.
- Date, currency, and formatting utilities.
- Shared validation schemas.
- Shared UI primitives that must look and behave the same, such as modal shells, banners, buttons, accessibility presets, and language selectors.
- Test fixtures for shared domain rules.

Recommended folder structure:

```text
breeding-app-shared/
  src/
    api/
      client.ts
      endpoints/
    auth/
      scopes.ts
      roles.ts
      tokens.ts
    genetics/
      geneLibrary.ts
      geneDatabase.ts
      morphAliases.ts
      quickAddParser.ts
      punnett.ts
    breeder/
      clutches.ts
      eggBoxes.ts
      hatchlings.ts
      labels.ts
    lab/
      orderTypes.ts
      pricing.ts
      statuses.ts
    marketplace/
      listingTypes.ts
      inquiryTypes.ts
    ui/
      Modal.tsx
      FloatingWindow.tsx
      BackendBanner.tsx
      AppearanceProvider.tsx
      LanguageSwitcher.tsx
    validation/
    tests/
  package.json
  tsconfig.json
```

Notes:

- Keep this package framework-light where possible.
- Separate pure domain utilities from React UI exports so the backend can reuse safe pure functions without importing React.

## Shared Database Responsibilities

The database remains one shared PostgreSQL database behind the backend.

Responsibilities:

- Store users, profiles, auth state, roles, and refresh tokens.
- Store breeder animals, pairings, clutches, app IDs, and synced payloads.
- Store lab orders, tests, samples, catalog, pricing, results, payments, labels, and certificates.
- Store marketplace listings, inquiries, messages, stores, sales, favorites, reviews, saved searches, and notifications.
- Store admin reports, audit logs, moderation state, verification requests, subscriptions, feature overrides, and usage tracking.
- Store mobile sync and device session records.

Ownership rules:

- `breeding-app-backend` owns schema changes.
- Frontend apps may request data only through API endpoints.
- No frontend app should run migrations or read/write the database directly.
- Each domain module should own its models conceptually, even while Prisma uses a single schema file.

## Shared Backend Responsibilities

The backend must provide stable contracts for all frontend repos.

Required backend API groups:

- `/api/auth`
- `/api/breeder`
- `/api/profiles`
- `/api/lab`
- `/api/lab/orders`
- `/api/marketplace`
- `/api/listings`
- `/api/inquiries`
- `/api/searches`
- `/api/notifications`
- `/api/subscriptions`
- `/api/admin`
- `/api/mobile`

Backend must enforce:

- Authentication.
- Role checks.
- Owner checks.
- Input validation.
- Rate limiting on auth and public endpoints.
- CORS only for approved frontend origins in production.
- Audit logging for admin/moderation/security-sensitive actions.
- Consistent error format.
- Server-side pagination for large lists.

## Shared Package Responsibilities

The shared package should prevent drift between apps.

Do share:

- API types.
- Auth scopes and roles.
- API client core.
- Genetics and morph normalization.
- Quick-add/free text parsing.
- Clutch, egg box, and hatchling numbering/counting rules.
- Label presets and label layout helpers.
- Lab statuses, order types, and pricing calculation rules.
- Marketplace listing and inquiry DTOs.
- Appearance/accessibility presets.
- Modal/floating-window primitives.
- i18n setup helpers and shared translation keys where appropriate.

Do not share:

- Page-level feature screens.
- App-specific routing.
- App-specific dashboards.
- App-specific local storage keys unless they are part of auth/session contracts.
- Admin-only UI components in public apps.
- Backend-only secrets, Prisma client, or database connection code.

## What Should Not Be Duplicated

These must have one implementation:

- Auth token refresh logic.
- Role and permission constants.
- API base URL resolution and validation.
- Genetics database and morph aliases.
- Het/free text parsing.
- Clutch number, egg box number, split-box, and egg count business rules.
- Lab order statuses and result status rules.
- Lab pricing calculations.
- Label sizing and preset definitions.
- Shared modal/floating-window behavior.
- Shared accessibility/visual impairment preset.
- API DTOs and validation schemas.
- Database schema and migrations.

Duplication allowed:

- Page layouts.
- App navigation.
- App-specific CSS themes.
- App-specific dashboards.
- App-specific copy.
- Tests that verify each app consumes shared behavior correctly.

## Security Rules For Database Access

1. Frontend apps must never connect directly to PostgreSQL.
2. Frontend apps must never contain `DATABASE_URL`, Prisma client code, database passwords, or migration scripts.
3. Only `breeding-app-backend` can read or write the database.
4. Every API request that changes user data must be authenticated.
5. Every data query must enforce owner, role, or permission checks on the backend.
6. Admin APIs must require admin/moderator/support roles as appropriate.
7. Lab APIs must require lab/admin roles, except breeder-facing order submission endpoints that are explicitly allowed for breeder users.
8. Marketplace write APIs must verify seller/buyer ownership and listing permissions.
9. Production CORS must allow only known frontend domains.
10. JWT secrets, database URLs, and third-party API keys must exist only in backend/server deployment secrets.
11. Refresh tokens must be stored and rotated server-side.
12. Admin and moderation actions must be audit logged.
13. Public marketplace endpoints must expose only public-safe listing/profile fields.
14. File/image upload endpoints must validate type, size, and ownership.
15. Database migrations must run from backend deployment or controlled admin tooling only.

## Environment Ownership

Frontend repositories:

- `VITE_API_URL`
- App-specific public configuration.
- Google Calendar public client ID only where needed.

Backend repository:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `CORS_ORIGIN`
- Payment/provider secrets if added.
- Mail/notification provider secrets if added.
- Storage provider secrets if added.

Shared package:

- No runtime secrets.
- No deployment-specific environment variables.

## Recommended Migration Path

1. Keep the current repo stable and use it as the source for extraction.
2. Build `breeding-app-shared` first inside the current repo or as a local package.
3. Move pure genetics, quick-add parsing, clutch/egg box rules, label presets, API types, and auth constants into shared.
4. Refactor `src/App.jsx` into breeder feature modules while still inside the current repo.
5. Extract backend modules into a module-based folder structure while still inside the current repo.
6. Create the four frontend repositories from cleaned feature boundaries.
7. Create `breeding-app-backend` from the server folder and Prisma schema.
8. Publish or link `breeding-app-shared` to all repos.
9. Set up CI for each repo.
10. Deploy backend first, then connect each frontend to the same `VITE_API_URL`.

## Initial Ownership Map From Current Repo

| Current source | Target repo |
| --- | --- |
| `src/App.jsx`, breeder portions of `src/App.css` | `breeding-app-breeder` |
| `src/features/animals/*` | `breeding-app-shared` and `breeding-app-breeder` |
| `src/features/breedingAdvisor/*` | `breeding-app-breeder`, with pure rules in `breeding-app-shared` if reused |
| `src/features/suggestions/*` | `breeding-app-breeder` |
| `src/components/breeding/*` | `breeding-app-breeder` |
| `src/admin/AdminApp.jsx` | `breeding-app-admin` |
| `src/features/lab/*` | `breeding-app-lab` |
| `src/services/lab/*` | `breeding-app-lab` or `breeding-app-shared` for pure reusable services |
| `src/features/marketplace/*` | `breeding-app-marketplace` |
| `src/features/mobile/*` | Usually `breeding-app-breeder`, unless mobile becomes its own app later |
| `src/features/auth/*` | `breeding-app-shared` plus app-specific login screens |
| `src/shared/*` | `breeding-app-shared` |
| `src/contexts/*` | `breeding-app-shared` if reused, otherwise app-specific |
| `src/genetics/*` | `breeding-app-shared` |
| `src/config/ballPythonGeneticsDatabase.json` | `breeding-app-shared` |
| `src/config/morphAliases.json` | `breeding-app-shared` |
| `src/features/labels/*` | `breeding-app-shared` and `breeding-app-breeder` |
| `src/utils/pdf/*` | `breeding-app-shared` or owning app depending on usage |
| `server/*` | `breeding-app-backend` |
| `electron/*` | `breeding-app-breeder` unless desktop shells are split separately |
| `android/*`, `ios/*`, `capacitor.config.ts` | `breeding-app-breeder` unless mobile becomes separate |
| `docs/*` | Shared docs repo or copied into owning repo by topic |

## Open Decisions

- Whether mobile remains part of `breeding-app-breeder` or becomes `breeding-app-mobile` later.
- Whether Electron remains breeder-only or becomes a desktop shell for multiple apps.
- Whether `breeding-app-shared` is a private npm package, git submodule, or monorepo workspace package.
- Whether lab PDF generation should be app-owned or shared.
- Whether marketplace public pages need server-side rendering later.
- Whether old files such as `src/App.js`, `App_prev.jsx`, `HEAD_App.jsx`, and `main_App.jsx` should be archived before extraction.

