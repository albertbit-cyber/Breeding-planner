# Production Upload Media Infrastructure Plan

Date: 2026-05-20

## Current State

The backend has a local upload storage abstraction and marketplace upload route. The current HTTP route supports base64 JSON uploads and persists metadata to `MarketplaceMedia`.

## Production Recommendation

- Use object storage rather than repo-local disk.
- Keep media storage isolated per environment.
- Enforce `MAX_UPLOAD_BYTES`.
- Preserve MIME signature validation.
- Keep scan status fields and security event recording.
- Add multipart or direct-to-object-storage upload before broad public launch.

## Required Before Production

- Decide storage provider.
- Define retention and deletion policy.
- Define private/public media access policy.
- Add backup or replication if required.
- Confirm media URLs do not expose storage credentials.

