# Marketplace Public-Safe Slice Plan

## Goal

Expose public marketplace listing data safely after breeder-lab work, without leaking private breeder, buyer, lab, or admin data.

## Backend Scope

- Review `marketplaceRoutes` and `marketplaceService`.
- Define a public listing DTO with listing id, title, species, morph/genetics summary, price, availability, public breeder profile summary, public images, and shipping/pickup flags.
- Exclude private contact details, internal notes, user ids where not necessary, audit fields, raw local animal records, and buyer/seller conversations.
- Do not simply remove auth from existing marketplace routes because the current authenticated DTO can expose `sellerUserId`, seller/internal ids, public data settings, and profile-derived details.

## Candidate Routes

- `GET /api/marketplace/public/listings`
- `GET /api/marketplace/public/listings/:slugOrId`
- `GET /api/marketplace/public/stores/:slugOrId`
- Public inquiry submission after the DTO is proven safe.

## Tests

- Backend tests for public listing shape and hidden fields.
- Authenticated breeder/admin management tests remain separate.
- E2E public listing browse/search after DTO is stable.

## Recommended Next Slice

Implement backend public listing DTO tests first, pick one marketplace contract to avoid duplicated listing systems, then connect marketplace frontend to that DTO.
