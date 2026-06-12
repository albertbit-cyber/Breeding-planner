# Marketplace Repo Extraction Plan

Target repository: `breeding-app-marketplace`

This plan covers the public and buyer/seller marketplace app only. It is a planning document; no source files are moved in this step.

## Scope

The marketplace app should contain:

- Public marketplace homepage.
- Snake listings.
- Search, filters, sorting, and saved searches.
- Listing detail pages.
- Breeder/seller profile and store pages.
- Buyer inquiry form and buyer/breeder messaging interface.
- Seller dashboard for marketplace listings and store settings.
- Public SEO pages.
- API connection to the shared backend.

It must not expose private breeder, lab, admin, or moderation-only data.

## Existing Marketplace-Related Files And Folders

Frontend:

- `src/features/marketplace/MarketplacePage.jsx`
- `src/features/subscriptions/PricingPage.jsx`, if pricing remains publicly reachable from marketplace.
- `src/shared/apiClient.ts`, marketplace functions and core auth/API pieces only.
- `src/features/auth/AuthGate.jsx`
- `src/contexts/SharedBackendContext.jsx`
- `src/components/SharedBackendBanner.jsx`
- `src/components/SharedBackendGuard.jsx`
- `src/contexts/AppearanceContext.jsx`, if shared appearance remains.
- `src/components/LanguageSwitcher.jsx`, if shared i18n remains.
- `src/i18n/*` and `src/locales/*`, filtered to marketplace/shared keys.
- `public/marketplace/ball-python-launch.png`

Related breeder listing creation source:

- Listing editor currently lives inside `MarketplacePage.jsx`.
- Breeder app also uses `fetchMyListings`/`saveMyListings` and should keep breeder-owned create-from-animal workflows after separation.

Backend dependencies to keep in `breeding-app-backend`:

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
- Marketplace-related Prisma models and migrations.

## Missing Marketplace Features

Current marketplace page includes homepage, filters, listing cards, detail overlay, store panel, seller dashboard, listing editor, favorites, conversations, sale creation, reviews API call, and admin panel section. Gaps to address:

- True public/unauthenticated browsing if desired; current marketplace routes require auth.
- Dedicated inquiry form instead of automatic canned conversation text.
- Saved search management UI.
- Notifications inbox UI.
- Conversations/messages page with thread detail.
- Favorites page.
- Sales/reservation workflow and buyer checkout/payment states.
- Reviews page/form surfaced in UI.
- SEO-friendly listing and breeder profile routes.
- Dedicated seller store settings/editor.
- Remove admin marketplace moderation section from marketplace repo.

## Routes And Pages Needed

Marketplace routes:

- `/`: marketplace homepage.
- `/marketplace`: listing search/browse.
- `/marketplace/listings/:id`: listing detail.
- `/marketplace/breeders/:userId` or `/marketplace/stores/:userId`: breeder/store profile.
- `/marketplace/inquiries/new?listingId=...`: inquiry form.
- `/marketplace/messages`: conversations list.
- `/marketplace/messages/:id`: conversation detail.
- `/marketplace/favorites`: saved/favorited listings.
- `/marketplace/searches`: saved searches.
- `/marketplace/notifications`: marketplace notifications.
- `/marketplace/seller`: seller dashboard.
- `/marketplace/seller/listings/new`: create listing.
- `/marketplace/seller/listings/:id/edit`: edit listing.
- `/marketplace/seller/store`: store profile/settings.
- `/pricing`: public subscription/pricing if marketplace owns it.
- `/seo/*`: public SEO content pages if implemented.

Admin-only routes must move to `breeding-app-admin`.

## Shared Code Dependencies

Move to or consume from `breeding-app-shared`:

- Auth scopes, token storage, role constants, API error shape, API base URL config.
- Marketplace listing DTOs, inquiry DTOs, message/conversation DTOs, notification DTOs, store/profile DTOs, sale/review DTOs.
- Listing default values and public data settings.
- Genetics display helpers so morphs/hets match breeder app display.
- Currency, date, weight, location, and image formatting helpers.
- Subscription public tier DTOs and feature catalog display metadata.
- Shared backend guard/banner and UI primitives.

Keep backend-only:

- Seller permission enforcement.
- Ownership checks.
- Listing moderation state enforcement.
- Public/private data filtering.
- Report handling and admin actions.
- Notification fan-out.
- Prisma client, schema, migrations, and secrets.

## Backend API Dependencies

Marketplace frontend endpoints currently available:

- `GET /api/health`
- `/api/auth/*`
- `GET /api/marketplace/listings`
- `GET /api/marketplace/listings/:id`
- `POST /api/marketplace/listings`
- `PATCH /api/marketplace/listings/:id`
- `PATCH /api/marketplace/listings/:id/status`
- `POST /api/marketplace/listings/:id/favorite`
- `GET /api/marketplace/stores/:userId`
- `PUT /api/marketplace/seller/store`
- `GET /api/marketplace/seller/dashboard`
- `POST /api/marketplace/conversations`
- `GET /api/marketplace/conversations`
- `POST /api/marketplace/conversations/:id/messages`
- `POST /api/marketplace/sales`
- `POST /api/marketplace/reviews`
- `GET /api/listings/marketplace`
- `GET /api/inquiries/me`
- `POST /api/inquiries`
- `PATCH /api/inquiries/:id`
- `GET /api/searches`
- `POST /api/searches`
- `DELETE /api/searches/:id`
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `GET /api/profiles/marketplace`
- `GET /api/subscriptions/public/tiers`

Admin/moderation dependencies that should move to admin app:

- `GET /api/marketplace/admin`
- `PATCH /api/marketplace/admin/stores/:userId`
- `GET /api/listings/moderation`
- `GET /api/listings/moderation/audit`
- `PATCH /api/listings/:id/status`
- `/api/admin/*` marketplace permission and report actions.

## Public And Private Data Boundaries

Public-safe data:

- Listing title, species, category, genetics summary, sex, year/birth date if seller publishes it, weight if seller publishes it, price/currency, availability, location at seller-approved granularity, shipping/pickup flags, public photos, seller display name/store, verified status, aggregate rating, review count, response time, public description, terms, and selected public documents/certificates.

Private data that must not be exposed:

- Full breeder planner animal record unless explicitly published field-by-field.
- Internal animal ID unless `showAnimalId` is enabled.
- Parent/lineage, feeding history, weight history, breeder notes, genetic test results, and documents unless corresponding public data settings permit exposure.
- Buyer/seller private messages outside the participants and authorized admins.
- Lab order data and sample/result details unless represented by a public certificate/document chosen by the seller.
- Admin notes, moderation audit logs, report details, verification submissions, subscription overrides, user status reasons, and GDPR records.

Backend must enforce these boundaries. The marketplace frontend should treat missing private fields as intentionally unavailable.

## Environment Variables

Frontend:

- `VITE_API_URL`: required hosted backend base URL.
- Optional public analytics/SEO metadata variables if added.

Do not include:

- `DATABASE_URL`
- `JWT_SECRET`
- Prisma client/migrations.
- Admin/moderation secrets.

## Build And Test Commands

Initial commands:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm test`
- `npm run typecheck`

Marketplace-focused tests to add:

- Listing formatter/default tests.
- Public/private field display tests.
- Search/filter query serialization tests.
- Inquiry and conversation API client tests.
- Seller-only route guard tests.
- SEO route metadata tests if SSR/static generation is added.

## Risks

- `MarketplacePage.jsx` currently mixes public browsing, seller dashboard, listing editor, and admin moderation in one component.
- Current browse/detail marketplace endpoints require authentication; public marketplace goals may require backend route policy changes.
- Public/private data filtering must not be implemented only in the frontend.
- Breeder app and marketplace app both need listing creation contracts without duplicating animal data rules.
- Admin moderation actions must be removed from the marketplace frontend to avoid exposing operations controls.
- SEO requirements may need a rendering strategy beyond current Vite client-only hash routing.

## Cleanup Tasks

- Split `MarketplacePage.jsx` into browse, detail, store, seller dashboard, listing editor, messages, saved searches, notifications, and favorites modules.
- Move admin panel behavior to `breeding-app-admin`.
- Move listing DTOs/defaults/formatters into shared package.
- Add explicit public/private field mapping tests against backend contract fixtures.
- Decide whether public browsing remains authenticated or gains unauthenticated read endpoints.
- Keep server code, Prisma files, generated artifacts, and secrets out of this frontend repo.
