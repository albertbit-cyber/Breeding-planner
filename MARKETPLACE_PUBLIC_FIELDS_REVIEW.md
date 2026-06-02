# Marketplace Public Fields Review

Date: 2026-05-16
Scope: Step 55.

## Current Findings

Marketplace routes currently require authentication for listing browsing:

- `GET /api/marketplace/listings`
- `GET /api/marketplace/listings/:id`
- `GET /api/marketplace/stores/:userId`

The normalized listing response includes fields that should be reviewed before making browsing public.

## Fields That Look Safe Publicly

- listing id or public slug
- title
- species
- morph/genetics display
- sex
- hatch date/year
- price
- currency
- availability
- description
- public images
- city/country if seller opted in
- seller display name/store name
- seller verification flag
- seller rating average/review count

## Fields Requiring Review

- `sellerUserId`
- internal seller `id`
- `rowId`
- `ownerId`
- `publicDataSettings`
- profile-derived contact fields
- conversation/sale identifiers

## Recommendation

Before enabling unauthenticated marketplace browsing, create a separate public response DTO that exposes only:

- public listing id/slug
- display listing details
- display seller/store summary
- public-safe location
- verified/rating badges

Avoid exposing:

- database row IDs
- user IDs
- owner IDs
- email/phone unless explicitly configured as public contact
- admin/moderation/audit fields

## Next Implementation Step

Add a public marketplace contract and tests before changing route auth from authenticated to public.

