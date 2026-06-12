# Multipart Upload Support Plan

Date: 2026-05-20

## Current Upload Contract

Marketplace upload currently accepts JSON base64 image payloads at:

- `POST /api/marketplace/uploads`

## Multipart Plan

When multipart support is added:

1. Use a dedicated upload middleware such as `multer` or `busboy`.
2. Keep upload route-specific body limits.
3. Stream to temporary storage or memory with strict max size.
4. Reuse `validateMarketplaceUpload`.
5. Reuse `uploadStorage`.
6. Persist metadata in `MarketplaceMedia`.
7. Keep owner/listing permission checks before final persistence.

## Security Requirements

- Reject unsupported image signatures.
- Enforce `MAX_UPLOAD_BYTES`.
- Do not trust client-provided MIME type.
- Keep scan status fields.
- Keep security event recording.

