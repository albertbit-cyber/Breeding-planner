# Lab Repo Extraction Plan

Target repository: `breeding-app-lab`

This plan covers the lab/genetic testing workflow app only. It is a planning document; no source files are moved in this step.

## Scope

The lab app should contain:

- Lab dashboard.
- Incoming genetic test orders.
- Order details.
- QR scanner and QR lookup workflows.
- Sample received, test in process, and testing completed statuses.
- Result entry, draft saving, and result submission.
- Results upload/finalization and certificate generation.
- Test catalog management where allowed.
- Pricing logic management where allowed.
- Admin oversight inside the lab domain.
- API connection to the shared backend.

## Existing Lab-Related Files And Folders

Frontend lab app:

- `src/features/lab/LabAppShell.jsx`
- `src/features/lab/pages/LabDashboardPage.jsx`
- `src/features/lab/pages/IncomingOrdersPage.jsx`
- `src/features/lab/pages/OrderDetailsPage.jsx`
- `src/features/lab/pages/SampleIntakePage.jsx`
- `src/features/lab/pages/ResultEntryPage.jsx`
- `src/features/lab/pages/CompletedTestsPage.jsx`
- `src/features/lab/pages/AdminOversightPage.jsx`
- `src/features/lab/pages/TestCatalogPage.jsx`
- `src/features/lab/pages/PricingLogicPage.jsx`
- `src/features/lab/components/*`
- `src/features/lab/components/dashboard/*`
- `src/features/lab/contexts/BatchOrderContext.jsx`
- `src/features/lab/hooks/*`
- `src/features/lab/api/*`
- `src/features/lab/utils/*`
- `src/features/lab/constants/orderStatuses.js`
- `src/features/lab/auth/roleGuard.ts`

Lab domain services/types/utilities:

- `src/services/lab/*`
- `src/services/pricing/calculateLabOrderPrice.ts`
- `src/services/pricing/calculateLabOrderPrice.test.js`
- `src/types/lab.ts`
- `src/types/labStatus.ts`
- `src/types/labTestCatalog.ts`
- `src/types/labPricing.ts`
- `src/types/labResultEntry.ts`
- `src/types/labShipmentLabels.ts`
- `src/types/labShedTerminal.ts`
- `src/types/labCertificate.ts`
- `src/data/testCatalog.ts`
- `src/config/testPricing.ts`
- `src/utils/labToken.ts`
- `src/utils/pdf/labOrderLabelsPdf.ts`
- `src/utils/pdf/labCertificatePdf.ts`

Shared app dependencies:

- `src/shared/apiClient.ts`
- `src/shared/config/api.ts`
- `src/shared/backendStatus.ts`
- `src/components/SharedBackendGuard.jsx`
- `src/components/SharedBackendBanner.jsx`
- `src/contexts/SharedBackendContext.jsx`
- `src/features/auth/AuthGate.jsx`

Backend dependencies to keep in `breeding-app-backend`:

- `server/src/routes/labRoutes.ts`
- `server/src/routes/orderRoutes.ts`
- `server/src/controllers/labController.ts`
- `server/src/controllers/orderController.ts`
- `server/src/services/labConfigService.ts`
- `server/src/services/orderService.ts`
- `server/src/services/orderResultService.ts`
- `server/src/services/orderNumberService.ts`
- `server/src/services/pricingService.ts`
- Related Prisma schema models and migrations.

## Missing Lab Features

Current lab shell covers dashboard, incoming orders, sample intake, result entry, completed tests, order details, catalog, pricing, and admin oversight. Gaps to confirm or add:

- Dedicated results upload workflow for file attachments if certificates/results are not only generated from entered fields.
- Certificate generation/download route surfaced as a first-class page or action.
- Explicit test in process queue/page distinct from incoming/completed views.
- Lab account settings and lab profile page.
- Scanner error handling and camera permission recovery UX.
- Production removal or hard lock of destructive dev tools; current dev-only delete/reset tools must not ship.
- Role model alignment: frontend uses `lab_staff`/`admin`, backend route checks use `lab`/`admin`/`breeder`.

## Routes And Pages Needed

Extract these lab routes:

- `/lab` or `/lab/dashboard`: dashboard.
- `/lab/incoming-orders`: incoming/all shed orders.
- `/lab/orders/:orderId`: order details.
- `/lab/sample-intake`: QR scanner and sample received workflow.
- `/lab/result-entry`: result draft and submission workflow.
- `/lab/in-process`: tests currently being processed, if separated.
- `/lab/completed-tests`: completed tests and certificate/results access.
- `/lab/test-catalog`: catalog management for lab/admin roles.
- `/lab/pricing-logic`: pricing logic management for lab/admin roles.
- `/lab/certificates/:orderId`: certificate generation/review if split from order details.
- `/lab/admin-oversight`: lab-domain oversight for admins.
- `/lab/settings`: lab profile/settings.
- `/lab/dev-tools`: development only; exclude from production builds.

## Shared Code Dependencies

Move to or consume from `breeding-app-shared`:

- Auth scopes, role constants, API error shape, API base URL config.
- Lab DTOs, status constants, status labels, and workflow transition constants.
- Lab pricing calculation and price DTOs.
- Lab order, sample, result, catalog, pricing, certificate, and shipment label types.
- QR lookup input parsing and lab token format helpers.
- Label sizing/layout utilities.
- PDF label/certificate pure layout helpers if breeder/admin need the same output.
- Genetics update engine for applying confirmed lab result outcomes to animal genetics.
- Shared backend guard/banner and UI primitives.

Keep backend-only:

- Order mutation and status transition enforcement.
- Payment status writes.
- Unique order/test number allocation.
- Result finalization persistence.
- Direct breeder genetics updates through database writes.
- Prisma client, schema, migrations, and secrets.

## Backend API Dependencies

Lab frontend endpoints:

- `GET /api/health`
- `/api/auth/*`
- `GET /api/lab/tests/catalog`
- `GET /api/lab/tests/pricing`
- `PATCH /api/lab/tests/catalog/:id`
- `PATCH /api/lab/pricing/:id`
- `POST /api/lab/orders/calculate-price`
- `GET /api/lab/orders`
- `GET /api/lab/orders/:id`
- `POST /api/lab/orders/:id/results/draft`
- `POST /api/lab/orders/:id/results/submit`
- `PATCH /api/lab/orders/:id/status`
- `PATCH /api/lab/orders/:id/payment`
- `DELETE /api/lab/orders/:id`
- `DELETE /api/lab/orders`, admin-only destructive endpoint currently used by dev tools.

Frontend local handler files under `src/features/lab/api/*` also model desired contracts for:

- Test catalog create/update/active/visibility.
- Result entry templates and draft/submission.
- QR token resolution and sample received marking.
- Shipment/sample label artifacts.
- Shed terminal pending tests and batch submission.
- Admin all-order oversight and corrections.

## Permissions Required

Observed backend role checks:

- Catalog/pricing read: authenticated.
- Catalog/pricing patch: `admin` or `lab`.
- Calculate order price and list/detail orders: `admin`, `lab`, or `breeder`.
- Create order: `breeder`.
- Result draft/submit, status patch, payment patch, delete one order: `admin` or `lab`.
- Delete all orders: `admin`.

Required lab app access:

- Lab app shell access: lab staff and admins only.
- Catalog/pricing management: lab staff and admins.
- Result submission and sample status updates: lab staff and admins.
- Admin oversight and destructive/dev tools: admins only.
- Breeder-facing order creation remains in breeder app, not lab app, even though it uses lab DTOs.

Resolve naming before split:

- Current frontend role guard uses `lab_staff`; backend uses `lab`. Standardize via shared role constants and migration/compatibility mapping.

## Environment Variables

Frontend:

- `VITE_API_URL`: required hosted backend base URL.
- Optional public app environment label.

Do not include:

- `DATABASE_URL`
- `JWT_SECRET`
- Prisma client/migrations.
- Payment/provider secrets.

## Build And Test Commands

Initial commands:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`
- `npm run typecheck`

Lab-focused tests to preserve or add:

- `src/features/lab/utils/labelSizing.test.js`
- `src/features/lab/utils/labelLayout.test.js`
- `src/services/lab/orderNumber.test.ts`
- `src/services/lab/testNumber.test.ts`
- `src/services/lab/certificateTemplate.test.ts`
- `src/services/lab/geneticsUpdateEngine.test.ts`
- `src/services/pricing/calculateLabOrderPrice.test.js`
- API client tests for status/result/catalog/pricing failures.

## Risks

- Lab code exists both as frontend local handlers/services and backend routes/services; extraction must decide which are UI helpers versus backend authority.
- Role name mismatch can lock out real lab users.
- Breeder app depends on lab batch cart/order modal/status contracts.
- Result finalization can affect animal genetics; duplicated rules could corrupt breeder records.
- Dev-only destructive tools must not be published in production lab repo.
- PDF labels/certificates depend on shared fonts/layout utilities and should be tested after relocation.

## Cleanup Tasks

- Split `LabAppShell.jsx` into route configuration, layout, and page modules.
- Move lab role constants/status constants into shared contracts.
- Remove breeder-only modal/cart UI unless kept as shared package exports consumed by breeder.
- Replace local API handler assumptions with shared backend API client calls.
- Add a production guard that excludes `/lab/dev-tools`.
- Keep backend server code, Prisma files, generated artifacts, and secrets out of this frontend repo.
