# Media Upload Strategy Decision

Date: 2026-05-20

## Decision

Multipart upload support is not required before the first staging execution gate.

## Reason

The current base64 JSON route is enough to validate:

- Authentication.
- Role enforcement.
- Listing ownership enforcement.
- Image signature validation.
- Local storage abstraction.
- `MarketplaceMedia` persistence.
- Security event recording.

## Tradeoff

Base64 JSON is less efficient than multipart for large images. Staging can proceed with the current route if uploads are kept within configured limits, but production media UX should move to multipart or direct-to-object-storage upload before public launch.

