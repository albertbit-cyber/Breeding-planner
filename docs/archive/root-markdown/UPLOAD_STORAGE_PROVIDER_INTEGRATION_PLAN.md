# Upload Storage Provider Integration Plan

Date: 2026-05-20

## Bucket Structure

- `staging/marketplace/<ownerUserId>/...`
- `production/marketplace/<ownerUserId>/...`

## Ownership

- Backend validates authenticated owner.
- Listing media requires seller/admin ownership.
- Storage keys should not grant access by themselves.

## Signed URLs

- Use short-lived signed URLs for private media.
- Public listing media can use CDN URLs only after moderation/validation rules are defined.

## Cleanup

- Delete orphaned uploads.
- Retain audit metadata.
- Define retention for rejected uploads.

