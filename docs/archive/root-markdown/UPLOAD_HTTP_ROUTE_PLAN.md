# Upload HTTP Route Plan

Date: 2026-05-20

## Goal

Expose the marketplace media upload foundation through authenticated backend HTTP routes.

## Contract

- `POST /api/marketplace/uploads`
  - Authenticated.
  - Roles: `admin`, `breeder`.
  - Rate limited by `marketplaceUploadLimiter`.
  - Body supports `dataBase64`, optional `originalName`, optional `listingId`.
  - Validates image signature and size through `validateMarketplaceUpload`.
  - Stores via `uploadStorage`.
  - Persists metadata in `MarketplaceMedia`.

- `GET /api/marketplace/uploads/me`
  - Authenticated.
  - Roles: `admin`, `breeder`.
  - Returns the current user's uploaded media rows.

## Ownership Rule

When `listingId` is supplied, only the listing seller or an admin can attach media to that listing.

