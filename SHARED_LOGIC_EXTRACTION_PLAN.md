# Shared Logic Extraction Plan

Generated from `04_extract_shared_logic_plan.md`, `CODEBASE_SPLIT_AUDIT.md`, and `TARGET_ARCHITECTURE.md`.

## Scope

This is a planning document only. No files were moved and no application code was changed.

The goal is to identify logic that should be extracted before splitting the product into:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`

## Extraction Rule

Move pure, reusable logic to `breeding-app-shared`.

Keep database access, secrets, Prisma code, backend-only authorization enforcement, and mutation services in `breeding-app-backend`.

Do not copy the same rule into multiple frontend repos.

## Shared Logic Inventory

| Shared item | Current file path | What it does | Future apps that need it | Move to `breeding-app-shared`? | Stay in backend? | Risks of moving it |
| --- | --- | --- | --- | --- | --- | --- |
| Gene library and gene groups | `src/genetics/geneLibrary.ts` | Defines canonical ball python gene groups, aliases, lookup and normalization helpers. | Breeder, Lab, Marketplace, Admin, Backend | Yes | Backend can import shared pure logic | High risk if duplicated; mismatched gene names would break het parsing, lab updates, and listing genetics display. |
| Gene alias database | `src/genetics/geneDatabase.ts` | Loads/defaults/normalizes gene alias rows and resolves canonical gene names. | Breeder, Lab, Marketplace, Backend | Yes | Backend can import shared pure logic | Needs separation between static defaults and user-editable alias state. Shared package should not depend on browser storage. |
| Genetics exports/cross helper | `src/genetics/index.ts` | Exposes genetics database helpers and Punnett cross wrapper. | Breeder, Advisor, Lab, Backend | Yes | No direct backend ownership unless reused server-side | Existing import paths may need coordinated migration. |
| Punnett logic | `src/genetics/punnett.ts` | Calculates genetic outcome probabilities. | Breeder, Advisor, Marketplace display, Backend if server-side calculations are added | Yes | No | Must preserve tests and probability output shape. |
| Pairing/genetics domain types | `src/types/pairing.ts` | Defines `Animal`, `Morph`, `Outcome`, breeding goals, plans, flowchart graph, suggestions, and pairing export rows. | Breeder, Advisor, Marketplace, Backend if persisted contracts use these | Yes | Backend may import type-only contracts | Current type names are broad; should avoid conflicts with Prisma `Animal` and API DTO names. |
| Morph alias config | `src/config/morphAliases.json` | Static morph alias data used by parser and genetics normalization. | Breeder, Lab, Marketplace, Backend | Yes | Backend can import shared data if needed | JSON data should remain versioned and tested because aliases affect generated genetics. |
| Genetics database config | `src/config/ballPythonGeneticsDatabase.json` | Static genetics database. | Breeder, Lab, Marketplace, Backend | Yes | Backend can import shared data if needed | Large static data should be tree-shakeable and not force every app to load it on first screen. |
| Quick add/free text parser | `src/features/animals/quickAddParser.ts` | Parses pasted animal text into ID, sex, morphs, hets, weight, dates, breeder, feeding info, and notes. | Breeder, Marketplace seller listing import, Lab sample intake, Backend validation | Yes | Backend can import pure parser for validation | Parser currently depends on available genetics input; extraction must keep behavior for `het`, `50% het`, and `66% het` exact. |
| Quick add parser tests | `src/features/animals/quickAddParser.test.ts` | Regression tests for free text parsing. | Shared package CI | Yes | No | Tests must move with parser to prevent breaking recent het fixes. |
| Lab domain types | `src/types/lab.ts`, `src/types/labTestCatalog.ts`, `src/types/labPricing.ts`, `src/types/labResultEntry.ts`, `src/types/labShipmentLabels.ts`, `src/types/labShedTerminal.ts`, `src/types/labCertificate.ts` | Defines lab entities, test orders, samples, results, pricing, labels, certificates, and shed terminal contracts. | Lab, Breeder, Admin, Backend | Yes | Backend should consume shared DTOs but own persistence | Some types may be UI-oriented rather than API DTOs; split domain types from view models. |
| Lab statuses and labels | `src/types/labStatus.ts` | Defines test order, payment, sample, certificate statuses, labels, and tones. | Lab, Breeder, Admin, Backend | Yes | Backend should own enforcement but can import constants | UI tones are frontend-specific; status enum values should be separated from visual tone mappings if backend imports them. |
| Shed order status constants | `src/features/lab/constants/orderStatuses.js` | Canonical shed order statuses matching backend `ShedOrderStatus`. | Lab, Breeder, Admin, Backend | Yes | Backend enum remains source of persisted values | There is overlap with `src/types/labStatus.ts`; consolidate to one status module before extraction. |
| Lab workflow rules | `src/services/lab/workflowRules.ts`, `src/services/lab/workflowEvents.ts` | Encodes status transitions and lab workflow events. | Lab, Admin, Backend | Partly | Backend should enforce transitions | Shared can expose transition maps, but backend must remain the authority for mutations. |
| Lab result genetics update engine | `src/services/lab/geneticsUpdateEngine.ts` | Applies confirmed lab result outcomes to animal morphs/hets. | Lab, Breeder, Backend | Yes, pure engine | Backend should apply updates during real result finalization | Must avoid importing browser/local store code. This is high-value shared logic because incorrect duplication can corrupt genetics. |
| Lab result finalization services | `src/services/lab/resultFinalizationService.ts`, `src/services/lab/resultEntryService.ts` | Coordinates result entry/finalization and genetics update decisions. | Lab, Backend | Partly | Mutation and access logic stays backend | Extract pure decision helpers only; keep actor checks and persistence backend-owned. |
| Lab order/test numbering | `src/services/lab/orderNumber.ts`, `src/services/lab/testNumber.ts`, `server/src/services/orderNumberService.ts` | Generates order/test numbers. | Lab, Backend | Maybe for formatting helpers | Backend should own unique number allocation | Moving too much frontend-side risks duplicate numbers. Shared package should only hold formatting/parsing helpers. |
| Lab pricing calculation | `src/services/pricing/calculateLabOrderPrice.ts`, `server/src/types/api.ts`, `src/config/testPricing.ts` | Calculates pricing tiers and price breakdowns for selected tests. | Breeder, Lab, Admin, Backend | Yes for pure calculation and types | Backend validates final price | Frontend estimates must match backend billing. Backend must remain authoritative for charged amounts. |
| Lab pricing services | `src/services/lab/pricingService.ts`, `server/src/services/pricingService.ts` | Pricing persistence and admin changes. | Lab, Admin, Backend | Only types/constants | Yes | Persistence and admin update behavior must not move to frontend shared code. |
| Test catalog data | `src/data/testCatalog.ts`, `src/services/lab/testCatalogService.ts` | Catalog of tests and catalog service behavior. | Lab, Breeder, Admin, Backend | Catalog DTOs/defaults yes | Backend owns persisted catalog | Need decide whether catalog is static seed data or database-owned runtime config. |
| API client core | `src/shared/apiClient.ts` | Shared fetch wrapper, auth scopes, token storage, refresh, error mapping, and domain API calls. | Breeder, Lab, Admin, Marketplace | Yes, split into core plus domain clients | Backend not needed | Current file mixes core auth with many domain endpoints. Extract core first, then per-domain clients. |
| API configuration | `src/shared/config/api.ts` | Resolves and validates `VITE_API_URL`, detects production localhost risk, builds base URL. | All frontend apps | Yes | No | Must keep production safety checks; each frontend should not invent its own fallback behavior. |
| Shared backend status | `src/shared/backendStatus.ts`, `src/contexts/SharedBackendContext.jsx`, `src/components/SharedBackendBanner.jsx`, `src/components/SharedBackendGuard.jsx` | Tracks backend health/config/auth status and displays diagnostics. | Breeder, Lab, Admin, Marketplace | Yes, frontend shared UI package | No | React UI should be separate from pure API config so non-React code can import config safely. |
| Auth scopes/token constants | `src/shared/apiClient.ts`, `server/src/types/auth.ts` | Defines frontend auth scopes and backend roles/token payload. | All frontend apps, Backend | Yes for role/scope constants and DTOs | Backend owns token signing/verification | Avoid duplicating role names. Shared roles must match Prisma `UserRole`. |
| Backend role enforcement | `server/src/middleware/roles.ts`, `server/src/middleware/auth.ts`, `server/src/utils/jwt.ts` | Verifies JWT and enforces API role access. | Backend | No, except exported role constants/types | Yes | Middleware must stay backend-only because it uses Express and secrets. |
| Auth validation schemas | `server/src/validators/authValidators.ts`, `server/src/utils/validators.ts` | Validates registration, login, password recovery, email/password/full name, and animal order input. | Backend, Auth UIs | Yes for schema/type definitions if frontend validation is desired | Backend must enforce all validation | If shared schemas use Zod, all apps need compatible dependencies. Backend remains final authority. |
| Subscription feature catalog | `server/src/services/subscriptionCatalog.ts` | Defines feature keys/groups and default limit types for subscription gating. | Breeder, Lab, Admin, Marketplace, Backend | Yes for feature catalog constants/types | Backend owns entitlement checks and persistence | Feature keys must be centralized; otherwise frontend guards and backend access drift. |
| Subscription access logic | `server/src/services/subscriptionService.ts`, `src/features/subscriptions/FeatureAccessGuard.jsx`, `src/features/subscriptions/PricingPage.jsx` | Evaluates and displays subscription access, tiers, overrides, and public pricing. | All frontend apps, Backend | Shared DTOs and feature constants yes | Backend owns `canAccessFeature` and usage writes | Do not move paid access decisions to frontend. Shared frontend guards are display helpers only. |
| Admin permission labels | `src/admin/AdminApp.jsx`, `server/src/services/adminService.ts` | Defines report types/statuses/actions, marketplace permission keys, and role permission display. | Admin, Backend, Marketplace where displaying permissions | Yes for constants/types | Backend owns enforcement | Current constants are embedded in UI and service files; extract carefully to avoid changing admin screens. |
| Marketplace listing UI defaults/types | `src/features/marketplace/MarketplacePage.jsx` | Defines listing filters, empty listing defaults, public data settings, money/image/tag helpers. | Marketplace, Breeder, Admin | Yes for DTOs/defaults/helpers | Backend owns persistence and permission checks | UI helper functions may depend on component assumptions; separate data defaults from rendering helpers. |
| Marketplace listing service types | `server/src/services/listingService.ts`, `server/src/services/marketplaceService.ts`, `server/src/services/inquiryService.ts`, `server/src/services/savedSearchService.ts`, `server/src/services/notificationService.ts` | Normalizes listings, enforces seller permissions, public listing mapping, inquiries, saved searches, and notifications. | Marketplace, Admin, Backend | DTOs/constants yes | Backend services stay backend | Public/private field mapping must stay backend-owned to avoid leaking private breeder data. |
| Marketplace route contracts | `server/src/routes/marketplaceRoutes.ts`, `server/src/routes/listingRoutes.ts`, `server/src/routes/inquiryRoutes.ts`, `server/src/routes/savedSearchRoutes.ts`, `server/src/routes/notificationRoutes.ts` | API route surface for marketplace features. | Marketplace, Admin, Backend | API endpoint types yes | Routes stay backend | Generate shared client methods from stable route contracts after endpoints are cleaned up. |
| Label preset constants | `src/constants/labelPresets.ts`, `src/features/labels/presets.ts` | Defines label brands, categories, thermal/sheet presets, units, validation and PDF label layout. | Breeder, Lab, Marketplace, Admin if printing labels | Yes | No, except backend PDF generation if added | Some strings currently contain encoding artifacts in generated display names; preserve behavior but clean before shared release. |
| Lab label sizing/layout | `src/features/lab/utils/labelSizing.ts`, `src/features/lab/utils/labelLayout.ts` | Normalizes lab label size, validates limits, safe areas, and label layout/debug helpers. | Lab, Breeder | Yes | No | Merge with general label presets without losing lab-specific constraints. |
| QR lookup parsing | `src/features/lab/utils/qrLookupInput.ts`, `src/utils/labToken.ts` | Parses QR/scanner input and handles lab sample tokens. | Lab, Breeder, Mobile, Backend | Yes for parser/token format types | Backend validates/authorizes token lookup | Tokens must remain opaque; shared code should not expose secrets or signing material. |
| QR scanner UI | `src/features/lab/components/LabQrScanner.jsx` | Reusable QR scanner component. | Lab, Breeder, Mobile | Yes, frontend UI package | No | Browser/camera permissions differ by platform; shared component needs app-level error handling hooks. |
| Lab label preview UI | `src/features/lab/components/LabLabelPreview.jsx` | Shared visual preview for sample/shipping labels. | Lab, Breeder | Yes, frontend UI package | No | Depends on label layout utilities and styling; avoid importing lab app state. |
| Batch order cart context | `src/features/lab/contexts/BatchOrderContext.jsx`, `src/features/lab/components/BatchOrderCart.jsx` | Manages breeder-side/lab-side batch genetic test cart state. | Breeder, Lab | Yes, frontend shared or lab package consumed by breeder | No | Context currently sits under lab feature but is used by breeder app; extraction must avoid circular dependency. |
| Breeder genetic test modal | `src/features/lab/components/BreederOrderGeneticTestModal.jsx` | Breeder-facing order modal for genetic tests. | Breeder, Lab | Maybe shared UI, but likely breeder app with shared lab DTOs | No | It is cross-domain UI; moving too early may couple breeder app to lab app internals. |
| Appearance/accessibility presets | `src/contexts/AppearanceContext.jsx` | Stores theme, colors, visual impaired preset, contrast, background mode, motion, typography, density. | All frontend apps | Yes, frontend shared UI package | No | Existing storage key is breeder-specific; shared package should allow app-specific storage namespace. |
| Language/i18n setup | `src/i18n/*`, `src/locales/*`, `src/components/LanguageSwitcher.jsx`, `electron/i18n.js` | Initializes translations and language switching for React and Electron. | All frontend apps, Electron shell | Yes, with app-specific translation bundles | No | Locale files include app-specific copy and some encoding artifacts; split shared keys from app keys. |
| Shared modal/floating window pattern | `src/App.jsx` scattered portals/modals, lab/admin/marketplace modal code | Floating cards, confirmation dialogs, scanner/import/add animal windows. | All frontend apps | Yes, UI primitive package | No | Current modal implementations are scattered; extract only after identifying common behavior and z-index policy. |
| Backend error type | `server/src/utils/errors.ts`, `src/shared/apiClient.ts` | Standard backend `HttpError` and frontend `SharedApiError`. | Backend, all frontend apps | Yes for API error response shape | Backend keeps `HttpError` implementation | Avoid sharing Express-specific error classes to frontend. Share serializable error contract instead. |
| Backend validators | `server/src/utils/validators.ts` | Validates email/password/name and lab order animals payload. | Backend, Breeder, Lab | Shared schemas yes | Backend enforcement stays backend | Current validators throw backend `HttpError`; shared validators should return schema results or throw neutral validation errors. |
| API route grouping | `server/src/app.ts` | Mounts all API route groups. | Backend, generated API clients | No direct move | Yes | Useful for contract docs, but Express app stays backend. |
| Prisma schema roles/enums | `server/prisma/schema.prisma` | Defines persisted enums/models including user roles, lab statuses, marketplace models. | Backend, shared generated types | Generated types maybe | Yes | Do not expose Prisma client to frontend. Only safe DTO/enum values can be exported. |

## Recommended Shared Package Modules

```text
breeding-app-shared/
  src/
    api/
      config.ts
      clientCore.ts
      errors.ts
      authClient.ts
      breederClient.ts
      labClient.ts
      marketplaceClient.ts
      adminClient.ts
    auth/
      roles.ts
      scopes.ts
      tokens.ts
      schemas.ts
    genetics/
      geneLibrary.ts
      geneDatabase.ts
      morphAliases.ts
      quickAddParser.ts
      punnett.ts
      types.ts
    breeder/
      animalTypes.ts
      pairingTypes.ts
      clutchRules.ts
      eggBoxRules.ts
      hatchlingRules.ts
    lab/
      types.ts
      statuses.ts
      pricing.ts
      workflowRules.ts
      resultGenetics.ts
      labels.ts
      qr.ts
    marketplace/
      listingTypes.ts
      listingDefaults.ts
      listingFormatters.ts
      inquiryTypes.ts
      notificationTypes.ts
    subscriptions/
      featureCatalog.ts
      tiers.ts
      accessTypes.ts
    labels/
      presets.ts
      layout.ts
      validation.ts
    ui/
      AppearanceProvider.tsx
      BackendStatusProvider.tsx
      FloatingWindow.tsx
      ConfirmDialog.tsx
      LanguageSwitcher.tsx
      QrScanner.tsx
    validation/
      commonSchemas.ts
```

## Backend-Only Logic

Keep these in `breeding-app-backend`:

- Prisma client and all direct database access.
- `server/src/lib/prisma.ts`.
- Express routes, controllers, and middleware.
- JWT signing and verification implementation.
- Refresh token storage/rotation.
- Role enforcement middleware.
- Subscription entitlement decisions and usage writes.
- Marketplace seller permission enforcement.
- Public/private marketplace field filtering.
- Admin audit logging.
- Lab order mutation and status transition enforcement.
- Payment status mutation and future provider integrations.
- Database migrations and seeds.

Shared package may define values, schemas, DTOs, and pure rules, but backend remains the authority.

## Extraction Order

1. Extract roles, auth scopes, API error shape, and API config.
2. Extract genetics library, morph aliases, quick-add parser, and tests.
3. Extract lab status constants and lab DTOs.
4. Extract label presets, label sizing, and QR parsing utilities.
5. Extract subscription feature catalog constants and access DTOs.
6. Extract marketplace DTOs/defaults/formatters without backend permission logic.
7. Extract UI primitives: floating window, confirmation dialog, backend banner, appearance provider.
8. Split `src/shared/apiClient.ts` into core client plus app/domain clients.
9. Move backend-safe shared pure functions into backend imports only after frontend tests pass.

## Test Requirements

Move or create tests with each extraction:

- Genetics and Punnett tests.
- Quick-add parser tests, especially het/possible het parsing.
- Lab genetics update engine tests.
- Lab pricing tests.
- Label sizing/layout tests.
- API config/client tests.
- Subscription feature catalog tests.
- Marketplace formatter/default tests.

No shared item should move without tests that prove the old behavior is preserved.

## Main Risks

- `src/App.jsx` still owns many breeder rules directly; shared extraction will be incomplete until clutch, egg box, hatchling, QR label, and modal helpers are pulled into pure modules.
- Some status constants overlap between frontend lab status files and backend Prisma enums. Consolidate names before moving.
- `src/shared/apiClient.ts` mixes auth/session infrastructure with many domain endpoint helpers. Moving it as one file would make every app depend on every domain.
- Backend validators throw `HttpError`, which should not leak into shared frontend code.
- UI shared components must not drag app-specific CSS, route assumptions, or local storage keys into all apps.
- Marketplace public/private data filtering must stay backend-owned to avoid data leaks.
- Subscription checks must stay backend-enforced even if frontend uses shared display guards.

