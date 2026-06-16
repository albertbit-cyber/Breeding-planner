# Shared Package Plan

Planning document for the future `breeding-app-shared` repository. No source files should be moved as part of this step.

## Goal

Create one shared TypeScript package used by:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend` where the code is pure and backend-safe

The package should prevent drift in types, roles, API contracts, genetics, lab statuses, marketplace DTOs, validation, and small reusable frontend primitives. It must not contain secrets, Prisma client code, database access, Express middleware, or app-specific screens.

## Recommended Repository Structure

```text
breeding-app-shared/
  src/
    index.ts
    api/
      config.ts
      clientCore.ts
      errors.ts
      authClient.ts
      breederClient.ts
      labClient.ts
      marketplaceClient.ts
      adminClient.ts
      contracts/
    auth/
      roles.ts
      scopes.ts
      permissions.ts
      tokens.ts
      schemas.ts
    genetics/
      geneLibrary.ts
      geneDatabase.ts
      morphAliases.json
      ballPythonGeneticsDatabase.json
      quickAddParser.ts
      punnett.ts
      types.ts
    breeder/
      animalTypes.ts
      pairingTypes.ts
      clutchRules.ts
      eggBoxRules.ts
      hatchlingRules.ts
      exportFields.ts
    lab/
      types.ts
      statuses.ts
      pricing.ts
      workflowRules.ts
      resultGenetics.ts
      labels.ts
      qr.ts
      catalog.ts
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
    validation/
      commonSchemas.ts
    ui/
      AppearanceProvider.tsx
      BackendStatusProvider.tsx
      BackendBanner.tsx
      FloatingWindow.tsx
      ConfirmDialog.tsx
      LanguageSwitcher.tsx
      QrScanner.tsx
    test-fixtures/
    tests/
  package.json
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  README.md
```

Keep pure domain exports separate from React exports. The backend should be able to import `auth`, `genetics`, `lab`, `marketplace`, `subscriptions`, `labels`, and `validation` without pulling in React or browser-only code.

## Files To Move Or Extract Later

Move these only after focused tests are in place:

| Current path | Shared target | Notes |
| --- | --- | --- |
| `src/genetics/geneLibrary.ts` | `src/genetics/geneLibrary.ts` | Canonical gene groups and normalization. |
| `src/genetics/geneDatabase.ts` | `src/genetics/geneDatabase.ts` | Separate static defaults from browser/user-editable storage before publishing. |
| `src/genetics/punnett.ts` | `src/genetics/punnett.ts` | Preserve probability output shape. |
| `src/genetics/index.ts` | `src/genetics/index.ts` | Rebuild exports around package entry points. |
| `src/config/morphAliases.json` | `src/genetics/morphAliases.json` | Shared alias vocabulary for breeder, lab, marketplace, backend validation. |
| `src/config/ballPythonGeneticsDatabase.json` | `src/genetics/ballPythonGeneticsDatabase.json` | Make tree-shakeable so every app does not load it on first screen. |
| `src/features/animals/quickAddParser.ts` | `src/genetics/quickAddParser.ts` | Shared breeder import, marketplace listing import, lab intake parsing. |
| `src/features/animals/quickAddParser.test.ts` | `src/tests/quickAddParser.test.ts` | Keep het and possible-het regression coverage. |
| `src/types/pairing.ts` | `src/breeder/pairingTypes.ts` | Rename broad `Animal`/`Morph` types if they conflict with API or Prisma names. |
| `src/types/lab*.ts` | `src/lab/types.ts` and related modules | Split DTO/domain types from UI view models. |
| `src/types/labStatus.ts` | `src/lab/statuses.ts` | Separate persisted status values from UI tone mappings. |
| `src/features/lab/constants/orderStatuses.js` | `src/lab/statuses.ts` | Consolidate with `labStatus.ts` and Prisma enum values. |
| `src/services/pricing/calculateLabOrderPrice.ts` | `src/lab/pricing.ts` | Backend must still validate charged amounts. |
| `src/services/lab/workflowRules.ts` and `workflowEvents.ts` | `src/lab/workflowRules.ts` | Shared transition maps only; mutation enforcement remains backend-owned. |
| `src/services/lab/geneticsUpdateEngine.ts` | `src/lab/resultGenetics.ts` | Pure result-to-genetics update behavior. |
| `src/data/testCatalog.ts` and `src/config/testPricing.ts` | `src/lab/catalog.ts`, `src/lab/pricing.ts` | Treat as defaults unless backend database owns runtime catalog/pricing. |
| `src/features/lab/utils/qrLookupInput.ts` and `src/utils/labToken.ts` | `src/lab/qr.ts` | Keep tokens opaque; no signing secrets. |
| `src/features/lab/utils/labelSizing.ts` and `labelLayout.ts` | `src/labels/layout.ts` or `src/lab/labels.ts` | Merge with shared label presets where reusable. |
| `src/constants/labelPresets.ts` and `src/features/labels/presets.ts` | `src/labels/presets.ts` | One label preset source for breeder/lab printing. |
| `src/shared/config/api.ts` | `src/api/config.ts` | Shared `VITE_API_URL` validation and production localhost guard. |
| `src/shared/backendStatus.ts` | `src/api/backendStatus.ts` | Pure status model can be shared. |
| `src/shared/apiClient.ts` | `src/api/*` | Split into client core plus domain clients before moving. |
| `src/shared/apiClient.test.js` and `src/shared/config/api.test.js` | `src/tests/api*.test.ts` | Preserve API URL and auth/session behavior. |
| `src/contexts/AppearanceContext.jsx` | `src/ui/AppearanceProvider.tsx` | Allow per-app storage namespace. |
| `src/contexts/SharedBackendContext.jsx`, `src/components/SharedBackendBanner.jsx`, `src/components/SharedBackendGuard.jsx` | `src/ui/*` | Frontend-only UI exports. |
| `src/components/LanguageSwitcher.jsx`, `src/i18n/*`, shared keys from `src/locales/*` | `src/ui/LanguageSwitcher.tsx`, i18n helpers | Split shared keys from app-specific translations. |
| `src/features/lab/components/LabQrScanner.jsx`, `LabLabelPreview.jsx`, `BatchOrderCart.jsx`, `src/features/lab/contexts/BatchOrderContext.jsx` | `src/ui/*` or `src/lab/*` | Only if breeder and lab both keep using them after extraction. |
| `server/src/types/auth.ts` | `src/auth/roles.ts`, `src/auth/tokens.ts` | Align role names with Prisma before moving. |
| `server/src/types/api.ts` | `src/lab/pricing.ts` or `src/api/contracts/lab.ts` | Shared DTOs only. |
| `server/src/validators/authValidators.ts` and `server/src/utils/validators.ts` | `src/validation/commonSchemas.ts` | Shared schema definitions must not throw backend `HttpError`. |
| `server/src/services/subscriptionCatalog.ts` | `src/subscriptions/featureCatalog.ts` | Constants and DTOs only; entitlement decisions remain backend. |

## Files That Should Not Be Shared

- `server/src/lib/prisma.ts`
- `server/prisma/schema.prisma`, migrations, seeds, generated Prisma client
- `server/src/app.ts`, `server/src/server.ts`
- `server/src/routes/*`, `server/src/controllers/*`, and mutation services
- `server/src/middleware/auth.ts`, `server/src/middleware/roles.ts`, `server/src/middleware/errorHandler.ts`
- `server/src/utils/jwt.ts`
- `server/src/config/env.ts`
- `.env`, backend `.env` files, `DATABASE_URL`, `JWT_SECRET`, service-role keys, payment/mail/storage secrets
- Page-level screens such as `src/App.jsx`, `src/admin/AdminApp.jsx`, `src/features/lab/pages/*`, `src/features/marketplace/MarketplacePage.jsx`
- App-specific routing, dashboard layouts, local deployment files, Electron/Capacitor packaging
- Backend marketplace public/private field filtering and seller permission enforcement
- Backend subscription entitlement decisions and usage writes
- Unique number allocation services such as `server/src/services/orderNumberService.ts`; shared code may expose formatting helpers only

## Import Rules For Apps

Use package subpath exports so apps import only what they need:

```ts
import { apiRequest } from "@breeding-app/shared/api";
import { AppRole, canAccessApp } from "@breeding-app/shared/auth";
import { normalizeGeneName } from "@breeding-app/shared/genetics";
import { LAB_ORDER_STATUSES } from "@breeding-app/shared/lab";
import type { MarketplaceListingDto } from "@breeding-app/shared/marketplace";
```

Rules:

- Frontend apps import only browser-safe modules and React UI modules.
- Backend imports only pure modules and DTOs, never `@breeding-app/shared/ui`.
- Apps must not import another app repository directly.
- Apps must not deep-import private package internals unless explicitly exported.
- Keep auth/session storage keys and API base URL logic centralized in shared.

## Package And Build Setup

Recommended `package.json` characteristics:

- Package name: `@breeding-app/shared` or private registry equivalent.
- `type: "module"`.
- Main outputs: ESM JavaScript plus `.d.ts`.
- Build with `tsup`, `tsc`, or equivalent.
- Peer dependencies for React UI exports: `react`, `react-dom`, and possibly `react-i18next`.
- Runtime dependencies should stay small. Use `zod` only if shared schemas are adopted across frontend and backend.
- Export maps should separate pure and UI modules:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./api": "./dist/api/index.js",
    "./auth": "./dist/auth/index.js",
    "./genetics": "./dist/genetics/index.js",
    "./lab": "./dist/lab/index.js",
    "./marketplace": "./dist/marketplace/index.js",
    "./subscriptions": "./dist/subscriptions/index.js",
    "./labels": "./dist/labels/index.js",
    "./validation": "./dist/validation/index.js",
    "./ui": "./dist/ui/index.js"
  }
}
```

CI should run:

- `npm run typecheck`
- `npm test`
- Package build
- Import smoke tests from a frontend app and the backend

## Versioning Strategy

- Start as a private package with semantic versioning.
- Use `0.x` while extracting and stabilizing contracts.
- Treat API DTOs, role names, status values, permission keys, and exported function signatures as compatibility-sensitive.
- Patch versions: bug fixes and non-contract behavior fixes.
- Minor versions: new exports, new statuses, new DTO fields that are optional/backward compatible.
- Major versions: renamed roles, removed exports, changed status values, required DTO fields, changed parser or pricing output shapes.
- Keep a changelog with migration notes for every app.
- During active split, use either a workspace package or pinned git/npm versions. Avoid floating `latest` in app repos.

## Extraction Order

1. Roles, auth scopes, token storage constants, API error shape, and API config.
2. Genetics library, morph aliases, genetics database, Punnett logic, quick-add parser, and tests.
3. Lab statuses, lab DTOs, pricing calculation, and result-genetics engine.
4. Label presets, label layout, and QR parsing utilities.
5. Subscription feature catalog constants and access DTOs.
6. Marketplace DTOs, defaults, and display formatters.
7. Shared frontend UI primitives and backend status components.
8. Domain API clients after route contracts are stable.

## Risks

- Current backend roles are `admin`, `lab`, `breeder`, `buyer`, `moderator`, and `support`, while lab frontend code also uses `lab_staff`; this must be reconciled before publishing shared role constants.
- `src/shared/apiClient.ts` currently mixes auth/session handling with breeder, lab, marketplace, admin, and notification requests. Moving it unchanged would make every app depend on every domain.
- Some lab statuses exist in multiple places and overlap with Prisma enums. The shared package should expose one canonical value set.
- Shared UI components can accidentally pull in app CSS, route assumptions, or browser storage keys.
- Static genetics data may be large; careless exports can increase first-load bundles.
- Marketplace privacy filtering, subscription enforcement, and lab status mutation rules must stay backend-enforced even if shared constants exist.
- Moving code before tests are ported risks changing genetics, het parsing, pricing, and label layout behavior silently.
