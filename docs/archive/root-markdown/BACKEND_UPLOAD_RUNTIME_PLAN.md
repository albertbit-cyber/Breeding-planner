# Backend Upload Runtime Plan

## Goal
Make marketplace uploads backend-owned with validation, ownership, and storage abstraction.

## Planned Flow
1. Authenticated seller/admin submits media.
2. Backend validates file signature and size.
3. Backend stores media through storage abstraction.
4. Backend records `MarketplaceMedia` with owner/listing/status/scan fields.
5. Public listing images only expose approved media URLs.

## Current Phase
Storage and validation foundations were added. Upload HTTP routes are still pending.

