# Audit Logging And Security Events Plan

Step: 250

## Current State

- `AdminAuditLog` exists.
- `ListingModerationAudit` exists.
- Notifications exist for user-facing events.
- Audit logging is not yet a central security event service.

## Plan

Create a central security/audit event service that records:

- login success/failure summary;
- refresh token rotation and revocation;
- password recovery;
- role changes;
- account disable/reactivation;
- marketplace moderation;
- listing status changes;
- lab result submission and status/payment changes;
- ownership/permission denials;
- suspicious messaging/upload/QR activity.

## Data Rules

- Do not store passwords, raw tokens, or full secrets.
- Redact request bodies.
- Store actor ID, target ID, action, IP hash or coarse IP where appropriate, user agent, and metadata.

## Tests

Add unit tests confirming sensitive events create audit rows and redact secret fields.
