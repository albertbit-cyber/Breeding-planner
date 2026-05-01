# Breeding Planner VS Code Workforce Stage Report

Date: 2026-05-01

## Plan Source Checked

The repo contains `docs/architecture/monorepo-migration-plan.md`. I did not find a separate file named `Breeding Planner VS Code Workforce Plan` in the workspace. This report uses the available plan plus the current git state after the crash.

## Current Git State

- Current branch: `Languges`
- Last completed commit: `8da6162 feat: add breeder data persistence foundation`
- Dirty files after the crash:
  - `server/prisma/schema.prisma`
  - `src/App.jsx`
  - `src/shared/apiClient.ts`
  - `src/shared/apiClient.test.js`
  - `server/prisma/migrations/20260501120000_add_buyer_role_and_profiles/migration.sql`

## Stage 1 Status

Done in commit `0204d6f docs: record stage 1 migration plan`.

- Added `docs/architecture/monorepo-migration-plan.md`.
- Documented the long-term app/package/backend target shape.
- Documented migration rules that keep the current app running while extracting one ownership area at a time.
- Updated `.env.example` with the local shared backend URL expectation.

## Stage 2 Status

Done in commit `8da6162 feat: add breeder data persistence foundation`.

- Added Prisma breeder core record persistence:
  - `Animal`
  - `Pairing`
  - `Clutch`
- Added migration `server/prisma/migrations/20260430103000_add_breeder_core_records/migration.sql`.
- Added authenticated breeder snapshot backend API:
  - `GET /api/breeder/snapshot`
  - `PUT /api/breeder/snapshot`
- Added route/controller/service files:
  - `server/src/routes/breederDataRoutes.ts`
  - `server/src/controllers/breederDataController.ts`
  - `server/src/services/breederDataService.ts`
- Registered breeder routes in `server/src/app.ts`.
- Added service tests in `server/src/tests/breederDataService.test.ts`.

## Stage 3 Status Before Continuing

Partially done, not yet verified.

Already present in the dirty worktree:

- Prisma schema now includes a `buyer` role.
- Prisma schema now includes a `Profile` model linked one-to-one to `User`.
- A new migration exists for buyer role and profiles:
  - `server/prisma/migrations/20260501120000_add_buyer_role_and_profiles/migration.sql`
- Frontend API client now exposes:
  - `fetchBreederSnapshot`
  - `saveBreederSnapshot`
- API client test coverage was started for breeder snapshot GET/PUT.
- `src/App.jsx` has a first pass of backend snapshot loading/seeding/autosave for `snakes` and `pairings` when the shared backend is connected and authorized.

Not yet done or not yet verified:

- Stage 3 changes have not been compiled/tested after the crash.
- The profile/buyer schema migration has not been applied or validated.
- There are no profile API routes/controllers/services yet.
- There is no buyer-facing marketplace/profile UI yet.
- The frontend snapshot sync currently sends empty `clutches`, so full clutch persistence is not finished.
- The autosave flow needs build/test verification and likely hardening around stale saves and backend/local merge behavior.
- No Stage 3 commit exists yet.

## Stage 3 Work Completed After Crash Recovery

- Verified and kept the frontend breeder snapshot API client additions:
  - `fetchBreederSnapshot`
  - `saveBreederSnapshot`
- Verified and kept the first frontend sync pass in `src/App.jsx`:
  - load backend breeder snapshot when shared backend auth is authorized
  - seed backend from local planner data when backend is empty
  - autosave changed `snakes` and `pairings` after initial seeding
- Completed the buyer role type follow-through required by the Prisma enum change:
  - added `buyer` to backend `AppRole`
  - updated auth service role typing
  - updated seed role typing
  - guarded lab order services so buyer users cannot fall through into breeder/lab workflows
- Verified the Stage 3 slice with focused tests and builds.

Verification completed:

- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd test -- breederDataService.test.ts` from `server/`
- `npm.cmd run build` from repo root
- `npm.cmd run build` from `server/`
- `git diff --check`

Known remaining issue outside this Stage 3 slice:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

## Immediate Next Work

Stage 3 was committed as `63e17c3 feat: complete breeder snapshot stage 3`.

## Next Stage Status

Committed as `6e3b9b7 feat: add breeder marketplace profiles`.

- Added profile backend API:
  - `GET /api/profiles/me`
  - `PUT /api/profiles/me`
  - `GET /api/profiles/marketplace`
- Added profile service/controller/routes:
  - `server/src/services/profileService.ts`
  - `server/src/controllers/profileController.ts`
  - `server/src/routes/profileRoutes.ts`
- Registered profile routes in `server/src/app.ts`.
- Allowed public registration for `buyer` while keeping public registration limited to `breeder` and `buyer`.
- Added buyer role support in the auth registration UI.
- Added frontend API client functions:
  - `fetchMyBreederProfile`
  - `saveMyBreederProfile`
  - `fetchMarketplaceProfiles`
- Added `#/marketplace` route and a first marketplace page:
  - buyers can browse public breeder profiles
  - breeders/admins can edit and publish their own public breeder profile
- Added tests for profile service behavior, buyer registration, and frontend profile API calls.

Verification completed:

- `npm.cmd test -- profileService.test.ts auth.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

## Sales Inventory/Listings Stage Status

Committed as `4f59dd4 feat: add marketplace sales listings`.

- Added Prisma `Listing` model for breeder-owned marketplace inventory.
- Added migration:
  - `server/prisma/migrations/20260501143000_add_marketplace_listings/migration.sql`
- Applied the migration to the configured local PostgreSQL database.
- Added listings backend API:
  - `GET /api/listings/me`
  - `PUT /api/listings/me`
  - `GET /api/listings/marketplace`
- Added listing service/controller/routes:
  - `server/src/services/listingService.ts`
  - `server/src/controllers/listingController.ts`
  - `server/src/routes/listingRoutes.ts`
- Updated public breeder profiles to include each breeder's available listings.
- Added frontend API client functions:
  - `fetchMyListings`
  - `saveMyListings`
  - `fetchMarketplaceListings`
- Updated marketplace UI:
  - breeders/admins can add, edit, remove, and save listings
  - buyers can see available listings grouped under public breeder profiles
- Added tests for listing service behavior, profile listings inclusion, and frontend listing API calls.

Verification completed:

- `npm.cmd test -- listingService.test.ts profileService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `node_modules\.bin\prisma.cmd migrate deploy` from `server/`
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

## Buyer Inquiry/Contact Workflow Stage Status

Committed as `efb319d feat: add marketplace listing inquiries`.

- Added Prisma `ListingInquiry` model linked to listings, breeders, and optional buyers.
- Added migration:
  - `server/prisma/migrations/20260501153000_add_marketplace_inquiries/migration.sql`
- Applied the migration to the configured local PostgreSQL database.
- Added inquiry backend API:
  - `POST /api/inquiries`
  - `GET /api/inquiries/me`
- Added inquiry service/controller/routes:
  - `server/src/services/inquiryService.ts`
  - `server/src/controllers/inquiryController.ts`
  - `server/src/routes/inquiryRoutes.ts`
- Added frontend API client functions:
  - `createListingInquiry`
  - `fetchMyInquiries`
- Updated marketplace UI:
  - buyers can ask about an available listing from the listing card
  - inquiry form pre-fills account name/email where available
  - buyers can see sent inquiries
  - breeders/admins can see received inquiries
- Added tests for inquiry creation/listing and frontend inquiry API calls.

Verification completed:

- `npm.cmd test -- inquiryService.test.ts listingService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `node_modules\.bin\prisma.cmd migrate deploy` from `server/`
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

## Inquiry Status/Response Notes Stage Status

Committed as `c94d13c feat: add inquiry follow-up management`.

- Added persistent inquiry follow-up fields:
  - `breederResponseNote`
  - `respondedAt`
- Added migration:
  - `server/prisma/migrations/20260501163000_add_inquiry_response_fields/migration.sql`
- Applied the migration to the configured local PostgreSQL database.
- Added inquiry update backend API:
  - `PATCH /api/inquiries/:id`
- Added service authorization so only the receiving breeder or an admin can update inquiry status/response notes.
- Supported inquiry statuses:
  - `new`
  - `contacted`
  - `in_discussion`
  - `closed`
- Added frontend API client function:
  - `updateInquiry`
- Updated marketplace UI:
  - breeders/admins can update inquiry status
  - breeders/admins can save response notes
  - buyers can see response notes and current status in their inquiry panel
- Added tests for inquiry follow-up updates and frontend update calls.

Verification completed:

- `npm.cmd test -- inquiryService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `node_modules\.bin\prisma.cmd migrate deploy` from `server/`
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

## Marketplace Filters/Search and Listing Detail Stage Status

Committed as `cbee880 feat: add marketplace search and listing detail`.

- Added client-side marketplace filters:
  - keyword search across listing, genetics, breeder, and location fields
  - sex filter
  - location filter
  - max price filter
- Added visible listing count and clear-filter action.
- Updated grouped breeder profile rendering so filters hide nonmatching listings and hide profiles with no matching listings.
- Added listing detail panel opened from listing cards.
- Detail panel shows price, sex, hatch date, genetics, animal ID, description, and image when available.
- Detail panel can start the existing inquiry flow.
- Added responsive CSS for filter controls and the listing detail panel.

Verification completed:

- `npm.cmd run build` from repo root
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

## Marketplace Listing Moderation Tools Stage Status

Committed as `27e6528 feat: add marketplace listing moderation`.

- Added admin-only listing moderation backend API:
  - `GET /api/listings/moderation`
  - `PATCH /api/listings/:id/status`
- Added service authorization so only admin users can moderate marketplace listings.
- Added moderation status support for:
  - `draft`
  - `available`
  - `reserved`
  - `sold`
  - `hidden`
- Updated listing serialization so database-owned moderation status overrides stale payload status.
- Added frontend API client functions:
  - `fetchModerationListings`
  - `updateListingStatus`
- Updated marketplace UI:
  - admins can see all marketplace listings in a moderation panel
  - admins can review breeder identity/email for each listing
  - admins can change listing status, including hiding a listing
  - status changes refresh the marketplace and moderation list
- Added tests for moderation listing, status updates, non-admin rejection, and frontend moderation API calls.

Verification completed:

- `npm.cmd test -- listingService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

Recommended next work:

1. Start the next stage: marketplace saved searches, email/notification workflow, or richer admin moderation/audit history.

## Marketplace Saved Searches Stage Status

Committed as `e5b8382 feat: add marketplace saved searches`.

- Added Prisma `SavedSearch` model linked to `User`.
- Added migration:
  - `server/prisma/migrations/20260501190000_add_marketplace_saved_searches/migration.sql`
- Applied the migration to the configured local PostgreSQL database.
- Added saved-search backend API:
  - `GET /api/searches`
  - `POST /api/searches`
  - `DELETE /api/searches/:id`
- Added saved-search service/controller/routes:
  - `server/src/services/savedSearchService.ts`
  - `server/src/controllers/savedSearchController.ts`
  - `server/src/routes/savedSearchRoutes.ts`
- Registered saved-search routes in `server/src/app.ts`.
- Added frontend API client functions:
  - `fetchSavedSearches`
  - `createSavedSearch`
  - `deleteSavedSearch`
- Updated marketplace UI:
  - users can save the current marketplace filters as a named search
  - users can apply saved searches back into the filter panel
  - users can delete saved searches
- Added tests for saved-search listing, creation, validation, deletion, and frontend API calls.

Verification completed:

- `node_modules\.bin\prisma.cmd migrate deploy` from `server/`
- `npm.cmd test -- savedSearchService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

Recommended next work:

1. Start the next stage: email/notification workflow or richer admin moderation/audit history.

## Marketplace Email/Notification Workflow Stage Status

Committed as `5de644d feat: add marketplace notifications`.

- Added Prisma `Notification` model linked to users as recipients and optional actors.
- Added migration:
  - `server/prisma/migrations/20260501193000_add_marketplace_notifications/migration.sql`
- Applied the migration to the configured local PostgreSQL database.
- Added notification backend API:
  - `GET /api/notifications`
  - `PATCH /api/notifications/:id/read`
- Added notification service/controller/routes:
  - `server/src/services/notificationService.ts`
  - `server/src/controllers/notificationController.ts`
  - `server/src/routes/notificationRoutes.ts`
- Registered notification routes in `server/src/app.ts`.
- Added notification creation for marketplace events:
  - new listing inquiry notifies the receiving breeder
  - inquiry follow-up notifies the buyer
  - listing moderation status changes notify the listing owner
- Added frontend API client functions:
  - `fetchNotifications`
  - `markNotificationRead`
- Updated marketplace UI:
  - users can see recent marketplace notifications
  - users can mark unread notifications as read
- Added tests for notification creation/listing/read behavior and notification side effects in inquiry/listing services.

Verification completed:

- `node_modules\.bin\prisma.cmd migrate deploy` from `server/`
- `npm.cmd test -- notificationService.test.ts inquiryService.test.ts listingService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

Recommended next work:

1. Start the final planned marketplace stage: richer admin moderation/audit history.

## Marketplace Moderation Audit History Stage Status

Committed as `b7bbcb9 feat: add marketplace moderation audit history`.

- Added Prisma `ListingModerationAudit` model linked to listings and optional admin actor.
- Added migration:
  - `server/prisma/migrations/20260501200000_add_listing_moderation_audit/migration.sql`
- Applied the migration to the configured local PostgreSQL database.
- Added admin-only moderation audit backend API:
  - `GET /api/listings/moderation/audit`
- Extended listing moderation status updates:
  - record previous status
  - record new status
  - record admin actor
  - record optional audit note
- Added frontend API client function:
  - `fetchModerationAudit`
- Updated marketplace moderation UI:
  - admins can enter an audit note when changing listing status
  - admins can review recent moderation history
- Added tests for moderation audit creation and listing.

Verification completed:

- `node_modules\.bin\prisma.cmd migrate deploy` from `server/`
- `npm.cmd test -- listingService.test.ts` from `server/`
- `node_modules\.bin\vitest.cmd run src\shared\apiClient.test.js`
- `npm.cmd run build` from `server/`
- `npm.cmd run build` from repo root
- `git diff --check`

Known remaining issue outside this stage:

- Root `npm.cmd run typecheck` still reports existing TypeScript issues in:
  - `src/features/lab/api/client.ts`
  - `src/utils/pdf/labCertificatePdf.ts`

Recommended next work:

1. Final review and app smoke test.
