# Marketplace Media Architecture Plan

Step: 253

## Target Architecture

- Backend-owned upload flow.
- Object storage for originals and thumbnails.
- CDN for approved public images.
- Database media table with owner, listing, status, sort order, moderation state, and URLs.

## Upload Flow

1. Seller requests upload slot.
2. Backend validates listing ownership and file metadata.
3. File is uploaded to private/quarantine storage.
4. Backend processes image, strips metadata, creates thumbnails.
5. Moderation status controls public visibility.

## Access Rules

- Seller can upload/manage own listing media.
- Admin can moderate/remove media.
- Public sees only approved media.
- Deleted listings detach or archive public media.

## Current Gap

Current marketplace media accepts URLs directly. That should remain only as a temporary local/dev bridge.
