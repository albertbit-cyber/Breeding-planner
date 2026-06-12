# Security Event Service Plan

## Goal
Create a centralized audit/security event path for auth, CSRF, permission, marketplace abuse, upload, and moderation events.

## Target Events
- `auth.login.success`
- `auth.login.failure`
- `auth.refresh.success`
- `auth.refresh.revoked_or_reused`
- `auth.logout`
- `csrf.blocked`
- `marketplace.rate_limited`
- `upload.rejected`
- `message.moderated`

## Target Storage
Add a Prisma `SecurityEvent` model in a later migration. It should store event type, actor, outcome, reason, sanitized metadata, IP hash, user agent, and timestamp.

## Safety Rules
- Never store tokens, passwords, cookies, or authorization headers.
- Sanitize metadata before writing.
- Do not block user requests if event logging fails.

