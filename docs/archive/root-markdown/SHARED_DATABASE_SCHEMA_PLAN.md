# Shared Database Schema Plan

Generated for Step 06 of the repo split planning phase. This is a planning document only; no database schema or migration was changed.

## Goal

Use one shared PostgreSQL database owned by the shared backend API. The future breeder, admin, lab, and marketplace apps should all speak the same data language through authenticated API contracts, not through direct database access.

The current schema lives in `server/prisma/schema.prisma` and already covers users, breeder records, lab workflows, admin controls, subscriptions, mobile scan/sync data, and marketplace entities.

## Schema Principles

- The backend is the only runtime that uses Prisma.
- Frontend apps receive DTOs from the API, not Prisma models.
- Every user-owned row must have an owner/seller/buyer/breeder foreign key or be reachable through one.
- Admin access must be audited.
- Marketplace public data must be separated from private breeder data by backend mapping rules.
- Lab result finalization must be immutable enough to support certificates and later audits.
- JSON payloads are acceptable as migration bridges, but core cross-app records should become structured tables over time.

## Current Enums

| Enum | Values | Purpose |
| --- | --- | --- |
| `UserRole` | `admin`, `lab`, `breeder`, `buyer`, `moderator`, `support` | Top-level account role used by auth and route guards. |
| `TestPricingType` | `morph`, `sex` | Lab catalog pricing category. |
| `PricingTier` | `tier_1_9`, `tier_10_49`, `tier_50_plus` | Lab order volume pricing tier. |
| `ShedOrderStatus` | `submitted`, `received`, `in_progress`, `completed`, `cancelled` | Lab order workflow state. |
| `ShedPaymentStatus` | `pending`, `invoiced`, `paid`, `waived` | Lab order payment state. |
| `ShedResultStatus` | `running`, `completed` | Lab result workflow state. |

Recommended enum additions later:

- `ListingStatus`
- `MarketplaceConversationStatus`
- `PaymentStatus`
- `VerificationStatus`
- `ReportStatus`
- `GdprRequestStatus`
- `HusbandryEventType`
- `LabSampleStatus`
- `CertificateStatus`

## Table Plan

### Auth, Users, Profiles

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `User` | Primary account and auth identity. | `id`, `email`, `passwordHash`, `fullName`, `role`, `isActive`, `emailVerified`, `status`, `verificationStatus`, subscription summary fields, `refreshToken`, timestamps. | Owns profile, animals, pairings, clutches, listings, lab orders, subscriptions, admin actions, marketplace records. |
| `Profile` | User/breeder public and contact profile. | `userId`, `breederName`, images, location, social links, public contact fields, `isPublic`. | One-to-one with `User`. |
| `UserDeviceSession` | Device/session metadata for mobile and future refresh token management. | `userId`, `deviceId`, `deviceName`, `platform`, `pushToken`, `lastSeenAt`. | Many sessions per user; unique per user/device. |
| `RefreshTokenSession` | Recommended future table for hashed refresh tokens. | `userId`, `deviceSessionId`, `tokenHash`, `expiresAt`, `revokedAt`, timestamps. | Replaces or supplements `User.refreshToken`. |

Ownership rules:

- A normal user can read/update only their own profile and session metadata.
- Admin can manage users through admin endpoints only.
- Password hash and token storage fields are never returned to frontend clients.

### Breeder Records

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `Animal` | Current persisted breeder snake record. | `ownerId`, `appAnimalId`, `name`, `sex`, `status`, `payload`, timestamps. | Belongs to `User`; referenced by app-level IDs and marketplace/lab payloads. |
| `Pairing` | Current persisted breeder pairing/project record. | `ownerId`, `appPairingId`, `label`, male/female app animal IDs, `status`, `startDate`, `payload`. | Belongs to `User`; has many `Clutch` rows. |
| `Clutch` | Current persisted clutch record. | `ownerId`, `pairingId`, `appClutchId`, `clutchNumber`, `seasonYear`, `laidDate`, `payload`. | Belongs to `User`; optional relation to `Pairing`. |
| `AnimalGeneticTrait` | Recommended future structured genetics table. | `animalId`, `geneName`, `traitType`, `zygosity`, `confidence`, `source`, `confirmedByLabResultId`. | Many traits per animal; may link to lab results. |
| `AnimalImage` | Recommended future image metadata table. | `animalId`, `imageUrl`, `sortOrder`, `isPrimary`, `visibility`. | Many images per animal. |
| `BreederNote` | Recommended future notes/activity table. | `ownerId`, `animalId`, `pairingId`, `type`, `body`, `eventDate`. | Owner-scoped notes. |

Ownership rules:

- Breeders can read/write only records where `ownerId = currentUser.id`.
- Admin support access must go through explicit admin endpoints and write audit logs.
- Lab and marketplace apps should never receive full `payload` unless the owner intentionally shares it.

### Spaces, Rooms, Racks, Tubs, Husbandry

These records are currently likely embedded in breeder snapshot JSON and mobile log payloads. They should become structured tables before serious multi-app sync.

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `Space` | Top-level breeder location grouping. | `ownerId`, `name`, `type`, `sortOrder`, `metadataJson`. | Belongs to `User`; has rooms/racks/tubs depending on model choice. |
| `Room` | Physical room or area. | `ownerId`, `spaceId`, `name`, `sortOrder`. | Belongs to `Space`. |
| `Rack` | Rack inside a room/space. | `ownerId`, `roomId`, `name`, `rows`, `columns`, `sortOrder`. | Belongs to `Room`; has tubs. |
| `Tub` | Specific tub/enclosure. | `ownerId`, `rackId`, `label`, `positionRow`, `positionColumn`, `currentAnimalId`. | Belongs to `Rack`; optionally assigned to `Animal`. |
| `AnimalLocationHistory` | Tracks animal movement. | `ownerId`, `animalId`, `fromTubId`, `toTubId`, `movedAt`, `reason`. | Belongs to animal and tubs. |
| `HusbandryEvent` | Feed, weight, shed, clean, water, note, health log. | `ownerId`, `animalId`, `eventType`, `eventAt`, `valueJson`, `note`, `source`. | Belongs to `User`; usually belongs to `Animal`. |

Ownership rules:

- All tables are `ownerId` scoped.
- Mobile write APIs must use the authenticated user, not client-submitted owner IDs.
- Location assignment should prevent two live animals from being assigned to the same tub unless explicitly allowed.

### Lab Workflows And Genetic Tests

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `LabAccount` | Lab operator profile and permissions. | `userId`, `labName`, contact/location, `status`, `permissionsJson`, `availableTestsJson`, `pricingJson`. | One-to-one with lab `User`. |
| `ShedTestCatalog` | Genetic/sex test catalog. | `id`, `name`, `shortLabel`, `geneTarget`, `category`, `pricingType`, `priceCents`, `currency`, priorities, visibility, active flag. | Referenced by ordered tests. |
| `PricingConfig` | Active lab pricing matrix. | Currency, morph tier costs, sex tier costs, `isActive`. | Used for order price snapshots. |
| `ShedTestOrder` | Lab order header. | `orderNumber`, `breederId`, `totalAnimals`, `pricingTier`, `totalPrice`, `currency`, `priceSnapshotJson`, `status`, `paymentStatus`, payment fields. | Belongs to breeder `User`; has animals and results. |
| `ShedTestOrderAnimal` | Animal row in a lab order. | `orderId`, `animalId`, `animalName`, cost fields, total. | Belongs to order; has ordered tests. |
| `ShedTestOrderAnimalTest` | Individual selected test for an animal. | `orderAnimalId`, `testId`, `testNameSnapshot`, `pricingTypeSnapshot`, `priceApplied`. | Belongs to order animal; optional catalog relation. |
| `ShedTestOrderResult` | Result output for an animal/test. | `orderId`, `animalId`, `sampleId`, `status`, `testCode`, `method`, `findingsJson`, `summary`, `reportedAt`, `analystUserId`, `notes`. | Belongs to order; unique by order/animal/test code. |
| `LabSample` | Recommended future sample tracking table. | `orderAnimalId`, `sampleCode`, `qrToken`, `status`, `receivedAt`, `extractedAt`, `storageLocation`, timestamps. | Belongs to ordered animal; feeds QR workflows. |
| `LabCertificate` | Recommended future certificate metadata. | `orderId`, `animalId`, `certificateNumber`, `status`, `pdfUrl`, `issuedAt`, `issuedByUserId`, immutable result snapshot. | Belongs to order/result set. |

Ownership rules:

- Breeders can create and read only their own orders.
- Lab users can process assigned/authorized lab queues.
- Admin can read/update lab records through admin/lab endpoints.
- Result submission must be restricted to `lab` and `admin`.
- Catalog/pricing edits must be restricted to `lab` and `admin`, with audit logging for production.

### Marketplace Listings, Messages, Sales

The schema currently has two marketplace/listing areas: legacy/current `Listing` tables and newer `Marketplace*` tables. The split should treat `Marketplace*` as the long-term marketplace schema and migrate legacy `Listing` usage deliberately.

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `Listing` | Existing owner-scoped listing snapshot model. | `ownerId`, `appListingId`, `animalAppId`, `title`, `status`, `priceCents`, `currency`, `payload`. | Belongs to `User`; has inquiries, reports, moderation audit. |
| `ListingInquiry` | Existing inquiry flow for legacy listings. | `listingId`, `breederId`, `buyerId`, buyer contact fields, `message`, `status`, response fields. | Belongs to `Listing`, breeder, optional buyer. |
| `SavedSearch` | Saved marketplace search filters. | `ownerId`, `name`, `filters`. | Belongs to `User`. |
| `Notification` | User notification record. | `recipientId`, `actorId`, `type`, `title`, `message`, `metadata`, `readAt`. | Belongs to recipient user; optional actor. |
| `MarketplaceListing` | Long-term marketplace listing table. | `sellerUserId`, `animalId`, `title`, species/category/genetics/sex/birth/weight, price/currency, status, availability, location, shipping/pickup, description, notes, public data settings, counters, feature/archive/publish timestamps. | Belongs to seller; has images, conversations, favorites, sales. |
| `MarketplaceListingImage` | Listing images. | `listingId`, `imageUrl`, `sortOrder`, `isPrimary`. | Belongs to `MarketplaceListing`. |
| `MarketplaceStore` | Seller storefront. | `userId`, `storeName`, logo/banner/about/location/social/policies, verification, rating aggregate. | One-to-one with seller `User`. |
| `MarketplaceConversation` | Buyer/seller conversation around a listing. | `listingId`, `buyerUserId`, `sellerUserId`, `status`, `lastMessageAt`. | Belongs to listing, buyer, seller; has messages. |
| `MarketplaceMessage` | Message in a marketplace conversation. | `conversationId`, `senderUserId`, `messageText`, `offerAmount`, `readAt`. | Belongs to conversation and sender. |
| `MarketplaceFavorite` | User favorite listing. | `userId`, `listingId`. | Unique per user/listing. |
| `MarketplaceSale` | Sale/deal record. | `listingId`, seller/buyer IDs, buyer contact snapshot, sale price/currency/deposit, payment and sale status, handover fields, notes. | Belongs to listing, seller, optional buyer; has reviews. |
| `MarketplaceReview` | Review after sale. | `saleId`, `reviewerUserId`, `sellerUserId`, rating fields, `reviewText`. | Belongs to sale, reviewer, seller. |

Ownership rules:

- Sellers can create/update only their own listings, store, conversations, and sales.
- Buyers can read/write only conversations, favorites, inquiries, and reviews they participate in.
- Admin/moderator can moderate through explicit admin/moderation endpoints.
- Public listing DTOs must be built by backend allowlists; never expose full animal or breeder payloads by default.

### Subscriptions, Payments, Usage

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `SubscriptionTier` | Plan catalog. | `key`, name/descriptions, monthly/yearly price, currency, trial/setup/discount fields, active/public/recommended flags, sort order, archive timestamp. | Has many `TierFeature`; referenced by user subscriptions. |
| `FeatureCatalog` | Feature key catalog. | `featureKey`, `featureName`, `featureGroup`, description, default limit type, sort order. | Referenced by `TierFeature`. |
| `TierFeature` | Feature availability per tier. | `tierId`, `featureKey`, `enabled`, `limitValue`. | Joins tier to feature. |
| `UserSubscription` | User's assigned subscription. | `userId`, `tierId`, `status`, `paymentStatus`, dates, provider IDs, internal note. | Belongs to user and optional tier. |
| `UserFeatureOverride` | Admin override for one user's feature. | `userId`, `featureKey`, `enabled`, `limitOverride`, `reason`, `expiresAt`, `createdByAdminId`. | Belongs to user and admin. |
| `UsageTracking` | Metered feature usage. | `userId`, `featureKey`, period start/end, used/limit amounts. | Unique per user/feature/period. |
| `PaymentTransaction` | Recommended future payment event ledger. | `userId`, `provider`, `providerEventId`, `purpose`, amount/currency/status, `rawEventJson`, timestamps. | Links to subscriptions, lab orders, or marketplace sales as needed. |

Ownership rules:

- Users can read their own effective access.
- Only backend services calculate entitlement and write usage.
- Only admin can create tiers, assign subscriptions, create overrides, or reset usage.
- Payment webhook writes must be idempotent by provider event ID.

### Admin, Moderation, Compliance

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `AdminAuditLog` | Admin action audit trail. | `adminUserId`, `targetUserId`, `action`, `beforeJson`, `afterJson`, `reason`, `internalNote`, timestamp. | Links actor and target users. |
| `ListingModerationAudit` | Listing moderation status history. | `listingId`, `actorId`, `previousStatus`, `newStatus`, `note`, timestamp. | Belongs to legacy `Listing`; should be mirrored/adapted for `MarketplaceListing`. |
| `Report` | User/listing/message report. | reporter/reported IDs, related listing/message IDs, `type`, `status`, description, assigned admin, resolution note. | Links users/listing. |
| `VerificationRequest` | Breeder/seller verification workflow. | `userId`, `type`, `status`, `submittedDataJson`, `adminNote`, reviewer fields. | Belongs to user and optional reviewer. |
| `MarketplacePermission` | Seller marketplace access controls. | `userId`, `canAccess`, `activeListingLimit`, `requireApproval`, `featuredBreeder`, `disabledReason`. | One-to-one with user. |
| `GdprRequest` | Privacy/export/deletion request tracking. | `userId`, `type`, `status`, `adminNote`, reviewer fields. | Belongs to user and optional reviewer. |

Ownership rules:

- Admin-only by default.
- Support/moderator access should be added with narrower role permissions, not broad admin reuse.
- Every mutation should write an audit record with actor, before/after state, and reason.

### Mobile And Sync

| Table | Purpose | Important fields | Relationships |
| --- | --- | --- | --- |
| `MobileScanLog` | QR scan event history. | `userId`, `animalId`, `qrCode`, `targetType`, `resultStatus`, `metadataJson`, timestamp. | Belongs to user. |
| `MobileSyncQueue` | Offline/mobile sync queue. | `userId`, `deviceId`, `actionType`, `payloadJson`, `status`, `errorMessage`, `processedAt`. | Belongs to user and optionally device. |
| `UserDeviceSession` | Device identity and push token. | See auth section. | Belongs to user. |

Ownership rules:

- Authenticated users can create/read only their own mobile records.
- QR lookup must resolve through opaque signed tokens or owner-scoped codes.
- Sync payloads must be validated before applying any mutation.

## Relationships Summary

- `User` is the root owner for breeder records, profile, subscriptions, lab orders, marketplace seller records, buyer records, admin actions, and mobile data.
- `Profile`, `MarketplacePermission`, `LabAccount`, and `MarketplaceStore` are one-to-one user extensions.
- `Animal`, `Pairing`, `Clutch`, breeder spaces, and husbandry tables are breeder-owned.
- `ShedTestOrder` belongs to a breeder user and contains ordered animals, selected tests, results, samples, and certificates.
- `MarketplaceListing` belongs to a seller user and contains images, conversations, favorites, sales, and reviews.
- `MarketplaceConversation` joins listing, buyer, seller, and messages.
- `SubscriptionTier` joins to `FeatureCatalog` through `TierFeature`; users get subscriptions and optional overrides.
- Admin audit and moderation tables link back to actor users and target records.

## Role-Based Access Rules

| Role | Database access through API |
| --- | --- |
| `admin` | Full operational access through admin endpoints; all mutations audited. |
| `lab` | Lab catalog/pricing if permitted, lab order queues, sample intake, result entry/finalization. No direct breeder private data beyond order context. |
| `breeder` | Own animals, pairings, clutches, spaces, husbandry, own lab orders, seller marketplace records, own subscriptions/access. |
| `buyer` | Own profile, favorites, saved searches, conversations, purchases/reviews, notifications. |
| `moderator` | Future narrow moderation access to reports/listings/messages; should not inherit full admin. |
| `support` | Future narrow read/support access; should not mutate roles, billing, lab results, or moderation without explicit permissions. |

## Supabase/PostgreSQL RLS Notes

The current backend uses Prisma directly, not Supabase client-side access. If Supabase/PostgreSQL row-level security is introduced later:

- Keep frontend apps blocked from direct table access unless a deliberate Supabase architecture decision is made.
- Use RLS as defense in depth for backend/database credentials where practical, not as a replacement for backend authorization.
- Add policies for `owner_id = auth.uid()` or equivalent on user-owned tables.
- Add service-role-only policies for admin, lab result finalization, subscriptions, payments, and audit tables.
- Avoid exposing JSON payload columns that may contain private breeder data.
- Use database views or API DTO mapping for public marketplace listing data.
- Ensure Prisma migrations and Supabase policies are versioned together.

Recommended RLS categories if adopted:

- Owner-scoped: `Animal`, `Pairing`, `Clutch`, future spaces/husbandry, `SavedSearch`, `Notification`, `MobileScanLog`, `MobileSyncQueue`.
- Participant-scoped: marketplace conversations/messages, sales, reviews.
- Seller-scoped: marketplace listings, stores, listing images.
- Breeder/lab-scoped: lab orders visible to breeder owner and authorized lab/admin users.
- Admin-only: reports, verification, marketplace permissions, audit logs, GDPR requests, subscription admin tables.
- Service-only: payment transactions, refresh token sessions, webhook ledgers.

## Migration Risks

- `Animal`, `Pairing`, `Clutch`, and `Listing` still rely on `payload` JSON for important app data; moving to structured tables can break import/export and sync unless staged.
- Breeder app identity uses app-level IDs such as `appAnimalId`, `appPairingId`, and `appClutchId`; migrations must preserve these IDs.
- Marketplace has overlapping legacy `Listing` and newer `MarketplaceListing` models; the split needs a clear cutover plan.
- Lab sample QR tracking and certificate records are not fully normalized yet; adding them after production use requires careful backfill from order/result data.
- Status values are partly strings in several admin/marketplace tables; converting them to enums can fail if existing rows contain unexpected values.
- Payment status exists in multiple domains; a shared payment ledger should be introduced without losing existing subscription/lab/marketplace state.
- Admin and moderation audit coverage must be complete before exposing separate admin tooling.
- Mobile routes and sync payloads may contain implicit assumptions from the monolith; schema hardening should happen before standalone mobile/offline workflows expand.

## Recommended Migration Order

1. Preserve the current Prisma schema as the backend-owned source of truth during the frontend split.
2. Add contract tests around current auth, breeder snapshot, lab order, marketplace, subscription, and admin data flows.
3. Centralize enum/status constants in `breeding-app-shared` DTO modules while keeping Prisma in backend.
4. Add `RefreshTokenSession` and migrate away from single-token storage on `User`.
5. Add structured spaces and husbandry tables, then migrate snapshot JSON data gradually.
6. Add lab sample and certificate tables before expanding QR/certificate workflows.
7. Choose the long-term marketplace listing model and migrate legacy `Listing` data into `MarketplaceListing` or formally keep both with separate API contracts.
8. Add payment transaction ledger and webhook idempotency.
9. Convert high-value string statuses to enums only after data cleanup scripts verify existing values.
10. Add optional PostgreSQL RLS policies as defense in depth after API ownership checks are already covered by tests.
