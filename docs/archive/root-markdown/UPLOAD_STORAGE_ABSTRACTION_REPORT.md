# Upload Storage Abstraction Report

## Added
- `breeding-app-backend/src/services/uploadStorageService.ts`

## What It Provides
- `UploadStorage` interface.
- `LocalUploadStorage` implementation.
- Deterministic local storage root from `UPLOAD_STORAGE_DIR` or `storage/uploads`.
- SHA-256 checksum generation.
- Safe storage keys that include owner segment and UUID.

## Pending
- Object storage implementation for staging.
- HTTP upload route.
- Public URL serving policy.

