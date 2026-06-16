# Breeder Repo Extraction Plan

Target repository: `breeding-app-breeder`

This plan covers the breeder-facing planner app only. It is a planning document; no source files are moved in this step.

## Scope

The breeder app should contain:

- Breeder dashboard and daily collection workflow.
- Snake/animal management, free-text quick add, images, activity logs, and IDs.
- Pairings, breeding projects, clutches, incubator, egg boxes, hatchlings, and lifecycle calendar.
- Spaces, rooms, racks, tubs, QR labels, and PDF label printing.
- Breeder settings, appearance, language, import/export, and Google Calendar integration.
- Genetics tools used by breeders, including morph aliases and Punnett/advisor behavior through shared logic.
- Breeder-side genetic test ordering and batch cart entry points.
- Create/edit marketplace listing workflow for owned animals.
- API connection to the shared backend.

## Files And Folders To Copy

Primary breeder app source:

- `src/App.jsx`
- `src/App.css`
- `src/index.jsx`
- `src/AuthShell.jsx`, until routing is replaced by a breeder-only entry.
- `src/features/animals/quickAddParser.ts`
- `src/features/animals/quickAddParser.test.ts`
- `src/features/breedingAdvisor/*`
- `src/features/suggestions/*`
- `src/features/labels/*`
- `src/components/breeding/*`
- `src/hooks/useGoogleCalendarIntegration.js`
- `src/genetics/*`, only until moved to `breeding-app-shared`.
- `src/config/ballPythonGeneticsDatabase.json`
- `src/config/morphAliases.json`
- `src/config/rules.json`
- `src/shared/*`, only until split into shared API/auth package imports.
- `src/contexts/AppearanceContext.jsx`
- `src/contexts/SharedBackendContext.jsx`
- `src/components/LanguageSwitcher.jsx`
- `src/components/SharedBackendBanner.jsx`
- `src/components/SharedBackendGuard.jsx`
- `src/i18n/*` and `src/locales/*`, filtered to breeder/shared keys.

Breeder-side lab ordering dependencies:

- `src/features/lab/components/BreederOrderGeneticTestModal.jsx`
- `src/features/lab/components/BreederShedTestingPanel.jsx`
- `src/features/lab/components/BatchOrderCart.jsx`
- `src/features/lab/contexts/BatchOrderContext.jsx`
- `src/features/lab/api/client.ts`, only breeder-safe client pieces.
- `src/features/lab/utils/qrLookupInput.ts`
- `src/features/lab/utils/labelSizing.ts`
- `src/features/lab/utils/labelLayout.ts`
- Shared lab DTO/status/pricing modules after extraction.

Marketplace listing creation dependencies:

- Breeder-owned listing create/edit UI currently in `src/features/marketplace/MarketplacePage.jsx`.
- `src/shared/apiClient.ts` functions for `fetchMyListings`, `saveMyListings`, `createMarketplaceListing`, and `updateMarketplaceListing`.

Build and packaging files:

- `package.json`
- `package-lock.json` or `pnpm-lock.yaml` after choosing one package manager.
- `vite.config.mts`
- `tsconfig.json`
- `index.html`
- `public/*` assets required by breeder screens.
- `electron/*`, `buildResources/*`, and related scripts if desktop remains breeder-owned.
- `capacitor.config.ts`, `android/*`, `ios/*`, and Android env files if mobile remains breeder-owned.

## Files And Folders To Remove From Breeder Repo

Remove or replace with shared package/backend API imports:

- `src/admin/*`
- Lab-only pages under `src/features/lab/pages/*`
- Lab-only admin/operations components not used by breeder ordering.
- Lab-only local API handlers under `src/features/lab/api/*` after backend contracts are stable.
- `src/features/marketplace/MarketplacePage.jsx` public browsing/admin sections, except listing creation logic if it is refactored into breeder-owned components.
- `src/features/mobile/*` if mobile becomes a separate repo later.
- Backend source: `server/*`
- Generated artifacts: `dist`, `build`, `server/dist`, `node_modules`, `server/node_modules`, log files, local Node zip/folder, and project zip files.
- Legacy/snapshot files such as `src/App.js`, `App_prev.jsx`, `HEAD_App.jsx`, and `main_App.jsx` unless a maintainer confirms they are still needed.

## Routes And Pages Needed

The extracted app should replace hash routing with breeder-only routes:

- `/` or `/dashboard`: breeder dashboard.
- `/animals`: collection list and animal detail.
- `/animals/new`: add animal, quick add, and import flows.
- `/pairings`: active and archived pairings.
- `/pairings/:id`: pairing lifecycle detail.
- `/clutches`: clutch/incubator overview.
- `/spaces`: rooms, racks, tubs, terrariums.
- `/calendar`: breeder calendar and Google Calendar sync.
- `/labels`: QR/PDF label tools.
- `/genetics`: genetics tools, Punnett/advisor, alias settings.
- `/lab-orders`: breeder-side genetic test orders.
- `/marketplace/listings/new` and `/marketplace/listings/:id/edit`: create/edit listing workflow.
- `/settings`: breeder, appearance, language, import/export, API status.
- `/pricing`: public/subscription pricing if kept in this app.

## Shared Code Dependencies

Move to or consume from `breeding-app-shared` before final extraction:

- Auth scopes, token storage keys, role constants, API error shape, and API base URL config.
- Genetics database, morph aliases, gene library, gene alias database, Punnett logic, and quick-add parser.
- Clutch, egg box, hatchling, label numbering, QR, and PDF layout helpers currently embedded in `src/App.jsx`.
- Label presets and lab label sizing/layout rules.
- Lab order DTOs, statuses, pricing calculation, QR token parsing, and breeder order modal contracts.
- Marketplace listing DTOs/defaults and public data setting types.
- Shared UI primitives: modal shell, floating window, backend guard/banner, language switcher, appearance provider.

## Backend API Dependencies

The breeder app must call only the shared backend:

- `GET /api/health`
- `/api/auth/*` for login, refresh, recovery, and current user.
- `GET /api/breeder/snapshot`
- `PUT /api/breeder/snapshot`
- `GET /api/profiles/me`
- `PUT /api/profiles/me`
- `GET /api/listings/me`
- `PUT /api/listings/me`
- Marketplace create/edit endpoints used by seller listing workflows.
- `GET /api/lab/tests/catalog`
- `GET /api/lab/tests/pricing`
- `POST /api/lab/orders/calculate-price`
- `POST /api/lab/orders`
- `GET /api/lab/orders`
- `GET /api/lab/orders/:id`
- `GET /api/subscriptions/access`
- `GET /api/subscriptions/public/tiers`

Backend role requirements observed:

- Breeder snapshot requires `admin` or `breeder`.
- Lab order creation requires `breeder`.
- Lab order price/list/detail allows `admin`, `lab`, or `breeder`.
- Marketplace seller writes require `admin` or `breeder` where enforced by route.

## Environment Variables

Frontend:

- `VITE_API_URL`: required hosted backend base URL.
- `VITE_GOOGLE_CLIENT_ID`: required only if Google Calendar sync remains enabled.
- `PUBLIC_URL`: deployment base path when needed.
- `ELECTRON_BUILD`: desktop build behavior if Electron remains in this repo.

Packaging:

- Android env files can stay breeder-owned only if mobile remains breeder-owned.
- No `DATABASE_URL`, `JWT_SECRET`, Prisma config, or backend secrets may be present in this frontend repo.

## Build And Test Commands

Initial commands inherited from the current repo:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`
- `npm run typecheck`
- `npm run i18n:verify`
- Desktop if retained: `npm run dist:win`
- Android if retained: `npm run build:android:dev`, `npm run android:sync`, `npm run android:debug`

Add focused tests during extraction:

- Quick-add parser and genetics tests.
- Clutch/egg box/hatchling rule tests after moving helpers out of `src/App.jsx`.
- Label layout and QR/PDF output tests.
- Breeder API client tests with mocked backend responses.

## Risks

- `src/App.jsx` is monolithic and owns many breeder workflows directly; extraction before refactoring increases regression risk.
- Clutch, hatchling, egg box, label, and animal identity logic are interdependent and should move as tested domain modules.
- Breeder and lab share order placement, batch cart, status display, and genetics result updates.
- Breeder and marketplace share listing creation and public/private animal data boundaries.
- Auth/session behavior is currently selected by hash route; a breeder-only app needs explicit auth scope setup.
- Electron and Capacitor packaging may carry unrelated app assumptions if copied wholesale.

## Cleanup Tasks

- Refactor `src/App.jsx` into breeder feature modules before repository creation.
- Extract shared genetics, labels, auth/API client, and modal primitives first.
- Split breeder-specific marketplace listing creation from public marketplace browsing.
- Keep frontend free of Prisma, backend services, migrations, and secrets.
- Remove generated artifacts and local machine files from the extracted source.
- Choose one lockfile/package manager before publishing.
