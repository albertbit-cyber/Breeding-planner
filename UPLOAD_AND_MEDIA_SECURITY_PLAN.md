# Upload And Media Security Plan

Step: 249

## Current State

- Marketplace listing media currently accepts image URLs.
- Breeder animal pictures appear mainly client/local-data driven.
- No backend upload pipeline with MIME sniffing, image processing, object storage, or virus scanning was found in the backend.

## Plan

1. Add backend upload endpoints only after storage strategy is decided.
2. Validate:
   - authenticated owner;
   - allowed MIME types;
   - max file size;
   - image dimensions;
   - extension does not control trust.
3. Process:
   - decode image server-side;
   - strip metadata;
   - generate thumbnails;
   - store original only if needed.
4. Store:
   - object storage bucket per environment;
   - private write path;
   - public CDN path only for approved marketplace images.
5. Scan:
   - integrate malware scanning for non-image documents;
   - quarantine failures.

## Ownership

Every media record should bind to owner user ID, listing ID or animal ID, status, and audit timestamps.
