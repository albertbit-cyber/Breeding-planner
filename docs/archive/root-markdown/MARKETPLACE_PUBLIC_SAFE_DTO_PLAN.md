# Marketplace Public Safe DTO Plan

Date: 2026-05-17
Scope: Step 73

## Goal

Design public-safe marketplace DTOs before making marketplace browsing unauthenticated.

## Public Listing DTO

Allowed fields:

- `id` or public slug
- title
- species
- morph/genetics display
- sex
- hatch date/year if intended public
- price
- currency
- availability
- description
- public image URLs
- city/country if seller opted in
- seller display name/store name
- seller verification status
- seller rating average/review count

Hidden fields:

- `sellerUserId`
- internal seller `id`
- `rowId`
- `ownerId`
- internal database IDs
- moderation/audit fields
- private email/phone
- conversation IDs
- sale IDs

## Public Seller/Profile DTO

Allowed fields:

- store slug or public id
- store name
- public location
- verification badge
- rating/review count
- optional public website/social links

Contact:

- Do not expose private email/phone by default.
- Prefer inquiry form routed through backend.
- Only expose contact fields if explicitly configured as public by seller.

## Proposed Public Routes

- `GET /api/marketplace/public/listings`
- `GET /api/marketplace/public/listings/:slugOrId`
- `GET /api/marketplace/public/stores/:slugOrId`
- `POST /api/marketplace/public/listings/:id/inquiries`

## Tests Required

- public listing excludes internal IDs
- public listing excludes private contact fields
- inquiry can be created without exposing seller email
- seller-owned/admin routes still require auth

