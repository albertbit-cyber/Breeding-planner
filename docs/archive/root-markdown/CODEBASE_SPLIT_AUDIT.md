# Codebase Split Audit

Generated from `01_project_audit_and_map.md`.

## Scope

This is an audit-only map of the current repository. No application code was changed.

The repository is a single mixed product containing:

- A React/Vite breeder planner app.
- Lab/genetic testing UI and workflow code.
- Marketplace and admin UI.
- A shared Express/Prisma backend.
- Electron desktop packaging.
- Capacitor Android/iOS mobile packaging.
- Shared genetics, label, PDF, API, auth, and appearance utilities.

The main split risk is that the breeder planner is still concentrated in `src/App.jsx` at about 22,539 lines, while newer domains have been added as feature folders around it.

## Current Entry Points

| Area | Entry files | Notes |
| --- | --- | --- |
| Main frontend shell | `src/index.jsx`, `src/AuthShell.jsx` | Hash routes select breeder, lab, marketplace, admin, mobile, pricing, or launch pages. |
| Breeder planner | `src/App.jsx` | Main monolithic planner. Includes animals, spaces, pairings, incubator, labels, calendar, import/export, QR, settings, and many modal flows. |
| Legacy/duplicate app files | `src/App.js`, `App_prev.jsx`, `HEAD_App.jsx`, `main_App.jsx` | Large older snapshots or alternate versions. Should be treated carefully before split. |
| Admin UI | `src/admin/AdminApp.jsx` | Admin panel for reports, subscriptions, marketplace moderation, and users. |
| Lab app | `src/features/lab/LabAppShell.jsx` | Lab dashboard and workflow pages. |
| Marketplace UI | `src/features/marketplace/MarketplacePage.jsx` | Marketplace listings and seller/buyer flows. |
| Mobile UI | `src/features/mobile/MobileApp.jsx` | Capacitor/mobile-specific screen. |
| Backend API | `server/src/app.ts`, `server/src/server.ts` | Express app and HTTP server. |
| Database schema | `server/prisma/schema.prisma` | Prisma/PostgreSQL schema, about 888 lines. |
| Desktop shell | `electron/main.js`, `electron/preload.js` | Local data persistence and desktop window shell. |
| Mobile shell | `capacitor.config.ts`, `android/`, `ios/` | Capacitor Android/iOS build targets. |

## Breeder Features

Primary files:

- `src/App.jsx`
- `src/App.css`
- `src/features/animals/quickAddParser.ts`
- `src/features/animals/quickAddParser.test.ts`
- `src/features/breedingAdvisor/*`
- `src/components/breeding/*`
- `src/features/suggestions/*`
- `src/goals/*`
- `src/rank/*`
- `src/signals/*`
- `src/hooks/useGoogleCalendarIntegration.js`

Feature areas found in the breeder app:

- Animal collection management.
- Animal add/edit/delete cards and image handling.
- Free text animal parsing.
- Morph/genetics and het parsing.
- Pairings and breeding projects.
- Clutches, incubator, egg boxes, hatchlings, egg box notes, and bad egg count.
- QR labels and QR import/export.
- PDF label generation.
- Spaces/racks/tubs.
- Calendar and Google Calendar integration.
- Import/export for animals and pairings.
- Suggestions/goals/advisor features.
- Appearance, language, and user settings.
- Shared backend sync through breeder snapshot endpoints.

Split recommendation:

- Extract breeder domain state and pure helpers out of `src/App.jsx` first.
- Keep clutch, egg box, hatchling, pairing, and animal identity logic together during the first extraction because numbering and status rules depend on the same records.
- Move PDF/QR/label functions to domain utilities before separating UI routes.

## Admin Features

Primary files:

- `src/admin/AdminApp.jsx`
- `server/src/routes/adminRoutes.ts`
- `server/src/controllers/adminController.ts`
- `server/src/services/adminService.ts`
- `server/src/middleware/roles.ts`
- `server/prisma/migrations/20260501213000_add_admin_user_management`
- `server/prisma/migrations/20260502002000_add_admin_reports`
- `server/prisma/migrations/20260502140000_add_admin_advanced_tools`
- `server/prisma/migrations/20260502143000_add_admin_subscription_controls`
- `server/prisma/migrations/20260502151500_align_admin_panel_profile_fields`

Admin capabilities appear to include:

- User management.
- Reports and moderation.
- Marketplace permissions and verification.
- Subscription controls.
- Admin audit logs.

Split recommendation:

- Keep admin UI and admin backend routes/services together.
- Do not split admin from auth/roles until auth scopes and role guards are stable.

## Lab And Genetic Testing Features

Primary frontend files:

- `src/features/lab/LabAppShell.jsx`
- `src/features/lab/pages/*`
- `src/features/lab/components/*`
- `src/features/lab/components/dashboard/*`
- `src/features/lab/contexts/BatchOrderContext.jsx`
- `src/features/lab/api/*`
- `src/features/lab/hooks/*`
- `src/features/lab/utils/*`
- `src/features/lab/constants/orderStatuses.js`
- `src/features/lab/auth/roleGuard.ts`

Primary service and utility files:

- `src/services/lab/*`
- `src/services/pricing/calculateLabOrderPrice.ts`
- `src/utils/pdf/labOrderLabelsPdf.ts`
- `src/utils/pdf/labCertificatePdf.ts`
- `src/utils/labToken.ts`
- `src/types/lab*.ts`
- `src/data/testCatalog.ts`
- `src/config/testPricing.ts`

Primary backend files:

- `server/src/routes/labRoutes.ts`
- `server/src/routes/orderRoutes.ts`
- `server/src/controllers/labController.ts`
- `server/src/controllers/orderController.ts`
- `server/src/services/labConfigService.ts`
- `server/src/services/orderService.ts`
- `server/src/services/orderResultService.ts`
- `server/src/services/orderNumberService.ts`
- `server/prisma/migrations/20260326120000_add_shared_order_results`
- `server/prisma/migrations/20260424223000_add_shed_test_order_number`
- `server/prisma/migrations/20260425142000_extend_shed_test_catalog_metadata`
- `server/prisma/migrations/20260426092921_add_payment_status`

Lab capabilities appear to include:

- Shed test ordering.
- Batch order cart.
- Order dashboard and queues.
- Sample intake.
- Result entry and finalization.
- Pricing logic.
- Test catalog management.
- QR lookup and QR scanning.
- PDF lab labels and certificates.
- Breeder-side genetic test ordering from the breeder app.

Split recommendation:

- Keep lab UI, lab API handlers, lab services, lab types, pricing, and PDF certificate/label utilities together.
- Keep `BatchOrderContext` available to both breeder and lab sides until breeder-side order modal is extracted cleanly.

## Marketplace Features

Primary frontend files:

- `src/features/marketplace/MarketplacePage.jsx`
- `src/admin/AdminApp.jsx`
- `public/marketplace/ball-python-launch.png`

Primary backend files:

- `server/src/routes/marketplaceRoutes.ts`
- `server/src/routes/listingRoutes.ts`
- `server/src/routes/inquiryRoutes.ts`
- `server/src/routes/savedSearchRoutes.ts`
- `server/src/routes/notificationRoutes.ts`
- `server/src/controllers/marketplaceController.ts`
- `server/src/controllers/listingController.ts`
- `server/src/controllers/inquiryController.ts`
- `server/src/controllers/savedSearchController.ts`
- `server/src/controllers/notificationController.ts`
- `server/src/services/marketplaceService.ts`
- `server/src/services/listingService.ts`
- `server/src/services/inquiryService.ts`
- `server/src/services/savedSearchService.ts`
- `server/src/services/notificationService.ts`
- `server/prisma/migrations/20260501143000_add_marketplace_listings`
- `server/prisma/migrations/20260501153000_add_marketplace_inquiries`
- `server/prisma/migrations/20260501163000_add_inquiry_response_fields`
- `server/prisma/migrations/20260501190000_add_marketplace_saved_searches`
- `server/prisma/migrations/20260501193000_add_marketplace_notifications`
- `server/prisma/migrations/20260501200000_add_listing_moderation_audit`
- `server/prisma/migrations/20260502093000_add_breeder_verification_requests`
- `server/prisma/migrations/20260502183000_add_marketplace_module`

Marketplace capabilities appear to include:

- Listings.
- Seller dashboard.
- Buyer inquiries.
- Saved searches.
- Notifications.
- Favorites, conversations, sales, reviews, stores, and moderation models in Prisma.
- Admin marketplace review/moderation.

Split recommendation:

- Marketplace should be split with its backend services and database models, not just the frontend page.
- Admin marketplace moderation needs a shared contract with the marketplace package.

## Auth And Routing

Primary files:

- `src/AuthShell.jsx`
- `src/features/auth/AuthGate.jsx`
- `src/shared/apiClient.ts`
- `server/src/routes/authRoutes.ts`
- `server/src/controllers/authController.ts`
- `server/src/services/authService.ts`
- `server/src/middleware/auth.ts`
- `server/src/middleware/roles.ts`
- `server/src/utils/jwt.ts`
- `server/src/validators/authValidators.ts`
- `server/src/types/auth.ts`

Current frontend auth scope is selected from the hash route:

- `/admin` uses admin token storage.
- `/lab` uses lab token storage.
- Other paths use breeder token storage.

Split recommendation:

- Auth should become a shared app package or shared service contract.
- Token storage keys, refresh logic, route guards, and role handling should stay together.
- Do not duplicate auth logic independently across breeder/lab/admin apps.

## Shared Components And Contexts

Primary files:

- `src/contexts/AppearanceContext.jsx`
- `src/contexts/SharedBackendContext.jsx`
- `src/components/SharedBackendBanner.jsx`
- `src/components/SharedBackendGuard.jsx`
- `src/components/LanguageSwitcher.jsx`
- `src/i18n/*`
- `src/locales/*`

Shared behavior:

- Appearance and accessibility settings.
- Shared backend diagnostics.
- Language/i18n setup.
- Cross-app auth/backend status display.

Split recommendation:

- Keep these in a shared frontend package.
- Appearance settings are used broadly and should not be copied into each app.

## Shared Genetics Logic

Primary files:

- `src/genetics/*`
- `src/config/ballPythonGeneticsDatabase.json`
- `src/config/morphAliases.json`
- `src/features/animals/quickAddParser.ts`
- `src/features/animals/quickAddParser.test.ts`
- `src/services/lab/geneticsUpdateEngine.ts`
- `src/services/lab/geneticsUpdateEngine.test.ts`
- `tests/genetics.test.ts`
- `tests/geneticsUpdateEngine.test.ts`

Shared genetics behavior:

- Gene library and canonical gene resolution.
- Morph aliases.
- Punnett/genetic outcome logic.
- Quick add/free text parsing.
- Lab result updates into animal genetics.

Split recommendation:

- This should be its own shared domain package before app splitting.
- The breeder app and lab app both need the same gene vocabulary and het handling.

## Database And API Code

Backend structure:

- Express app: `server/src/app.ts`
- Server entry: `server/src/server.ts`
- Environment config: `server/src/config/env.ts`
- Prisma client: `server/src/lib/prisma.ts`
- Routes: `server/src/routes/*`
- Controllers: `server/src/controllers/*`
- Services: `server/src/services/*`
- Middleware: `server/src/middleware/*`
- Tests: `server/src/tests/*`
- Schema and migrations: `server/prisma/*`

API route groups currently mounted:

- `/api/auth`
- `/api/breeder`
- `/api/profiles`
- `/api/listings`
- `/api/inquiries`
- `/api/searches`
- `/api/notifications`
- `/api/subscriptions`
- `/api/marketplace`
- `/api/mobile`
- `/api/admin`
- `/api/lab`
- `/api/lab/orders`

Database domains in Prisma include:

- Users, profiles, roles, auth/refresh tokens.
- Breeder animals, pairings, clutches, listings.
- Shed test orders, catalog, pricing, results, payment.
- Marketplace listings, stores, messages, conversations, favorites, sales, reviews.
- Admin reports, audit logs, verification requests, permissions.
- Subscriptions and usage tracking.
- Mobile scan logs, sync queue, device sessions.

Split recommendation:

- Backend can split by route/service domains after shared auth, user, profile, and Prisma models are clearly owned.
- A single Prisma schema is currently the integration point; splitting apps before splitting schema ownership will be safer.

## Environment Variables

Frontend/client:

- `VITE_API_URL`: shared backend API base URL.
- `VITE_GOOGLE_CLIENT_ID`: Google Calendar sync.
- `PUBLIC_URL`: deployment base path.
- `ELECTRON_BUILD`: disables Vite code splitting for Electron when true.

Backend/server:

- `DATABASE_URL`: required by Prisma.
- `JWT_SECRET`: required by auth.
- `PORT`: defaults to `4000`.
- `CORS_ORIGIN`: defaults to `*`.
- `NODE_ENV`: controls production/development behavior.

Local service/cache variables also appear in `.env.example`:

- `SEARCH_PROVIDER`
- `BING_SEARCH_KEY`
- `SERPAPI_KEY`
- `SQLITE_PATH`
- `CACHE_TTL_HOURS`
- `CACHE_ONLY`

Desktop/local storage:

- `LAB_DB_PATH`
- `CACHE_DB_PATH`
- `ELECTRON_START_URL`
- `VITE_DEV_SERVER_URL`

Android environment files:

- `.env.android-development`
- `.env.android-staging`
- `.env.android-production`

Split recommendation:

- Create per-app `.env.example` files once apps are separated.
- Keep backend required variables documented at `server/.env.example`.
- Do not allow production clients to default to localhost.

## Build, Test, And Deployment Files

Frontend/build:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `vite.config.mts`
- `tsconfig.json`
- `index.html`
- `public/*`
- `src/setupTests.js`
- `tests/*`

Backend/build:

- `server/package.json`
- `server/package-lock.json`
- `server/tsconfig.json`
- `server/vitest.config.ts`
- `server/prisma/*`

Desktop:

- `electron/*`
- `buildResources/*`
- `scripts/start-electron.js`
- `scripts/build-win.js`
- `build-installer.ps1`

Mobile:

- `capacitor.config.ts`
- `android/*`
- `ios/*`
- `scripts/android-build.ps1`
- `docs/mobile/android-build-and-install.md`

Docs and manuals:

- `README.md`
- `BUILD_AND_SERVE.md`
- `docs/handoff/*`
- `docs/manuals/*`
- `APP_STORE_CHECKLIST.txt`
- `APP_INFO.txt`

Potential cleanup before split:

- Both `package-lock.json` and `pnpm-lock.yaml` exist. Pick one package manager before structural splitting.
- `server/dist`, `server/node_modules`, root `node_modules`, `build`, `dist`, and local log files are generated/runtime artifacts and should not be part of a clean source split.
- `node-v22.11.0-win-x64` and `node-v22.11.0-win-x64.zip` are local tool artifacts and should be excluded from split repos unless intentionally distributed.
- `Breeding-planner-project.zip` is a generated archive, not source.
- Root files named `=`, `0.0001`, `App_prev.jsx`, `HEAD_App.jsx`, and `main_App.jsx` should be reviewed before split; they look like local or merge artifacts/snapshots.

## Files That Should Stay Together

| Group | Keep together |
| --- | --- |
| Breeder app core | `src/App.jsx`, breeder-specific CSS, breeder tests, quick add parser, labels, calendar hook, breeder snapshot API calls. |
| Clutch/incubator logic | Pairings, clutches, egg boxes, hatchlings, label numbering, clutch card printing, egg count updates. |
| Lab app | `src/features/lab/*`, `src/services/lab/*`, lab PDF utilities, lab types, lab tests, lab backend routes/controllers/services. |
| Marketplace | `src/features/marketplace/*`, marketplace/listing/inquiry/search/notification backend services, related Prisma migrations. |
| Admin | `src/admin/AdminApp.jsx`, admin backend route/controller/service, roles, reports, audit models. |
| Auth | `AuthGate`, `AuthShell`, `apiClient`, auth backend routes/controllers/services, JWT and role middleware. |
| Genetics | `src/genetics/*`, morph/gene config JSON, quick-add parsing, genetics update engine. |
| Shared backend client | `src/shared/*`, `src/contexts/SharedBackendContext.jsx`, backend health/snapshot calls. |
| Appearance/i18n | Appearance context, language switcher, i18n config, locale JSON files. |
| Packaging | Electron files together; Capacitor/Android/iOS files together; installer scripts with Electron build config. |

## Files Needing Refactor Before Split

High priority:

- `src/App.jsx`: too large and owns too many breeder workflows.
- `src/App.js`: large legacy/alternate app file should be deleted, archived, or clearly documented before split.
- `src/AuthShell.jsx`: currently knows every top-level app section; should become a small router over separately owned app entries.
- `src/shared/apiClient.ts`: shared auth/API client spans breeder, lab, admin, marketplace; split into core client plus domain clients.
- `server/prisma/schema.prisma`: central schema should have model ownership comments or generated domain maps before backend extraction.

Medium priority:

- Move breeder PDF/QR/export helpers out of `src/App.jsx`.
- Move clutch and egg box numbering/counting into tested pure functions.
- Move appearance modal and shared modal/portal patterns into components.
- Consolidate duplicated tests between root `tests/*`, `src/*.test.*`, and `server/src/tests/*`.
- Decide whether `src/App.js` is still needed by any build path.
- Decide whether `craco.config.js` is obsolete now that Vite is primary.

Cleanup priority:

- Remove generated logs from source control if tracked.
- Remove generated archives and local Node distribution files from active split inputs.
- Choose one lockfile/package manager.
- Review `.claude` settings and local temp/config artifacts before publishing a split repo.

## Proposed Split Order

1. Create a shared domain package for genetics, labels, and pure breeder helpers.
2. Extract breeder app state and UI slices from `src/App.jsx` without changing behavior.
3. Extract shared frontend shell utilities: auth, API client, appearance, i18n, backend status.
4. Split lab frontend plus lab services/types/PDF utilities.
5. Split marketplace frontend plus marketplace backend services.
6. Split admin UI and admin backend services.
7. Separate desktop/mobile packaging from application source.
8. Only after source ownership is clear, consider separate repositories or packages.

## Main Risks

- Splitting before untangling `src/App.jsx` will make bugs in clutches, egg boxes, hatchlings, labels, and animal edits harder to fix.
- Auth and API token scope are shared by hash route; duplicating them could break admin/lab/breeder login behavior.
- Lab and breeder share genetic test ordering, batch order state, and result-driven genetics updates.
- Marketplace and admin share moderation/reporting/subscription data.
- Prisma is the single shared schema; backend split needs model ownership boundaries first.
- Generated artifacts and local tool files may pollute a clean project handoff if not excluded.

## Suggested First Refactor Targets

1. `src/App.jsx` clutch/incubator helpers into `src/features/breeder/incubator/*`.
2. `src/App.jsx` animal modal and image helpers into `src/features/breeder/animals/*`.
3. QR/PDF label creation into `src/features/breeder/labels/*` or shared `src/features/labels/*`.
4. Shared modal/portal component to standardize floating windows.
5. Domain API wrappers around `src/shared/apiClient.ts`.
6. Prisma model ownership comments or a generated schema map.

