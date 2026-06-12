# Marketplace Upload Runtime Plan

## Goal
Move marketplace media uploads to a backend-owned storage runtime with ownership and validation.

## Planned Runtime
- Authenticated upload endpoint scoped to the seller.
- Media records owned by user/listing.
- Storage abstraction with local filesystem for development and object storage for staging/production.
- Signed or backend-proxied public URLs.
- Delete/replace operations gated by owner/admin permission helpers.

## Database Needs
- `MarketplaceMedia` or extend `MarketplaceListingImage` with owner, storage key, MIME, size, checksum, status, and scan result.

## Not Implemented In This Phase
No upload endpoint or storage backend was added in this step set. This remains a staging-prep plan.

