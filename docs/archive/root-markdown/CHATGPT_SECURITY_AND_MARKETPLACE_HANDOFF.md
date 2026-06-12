# ChatGPT Security And Marketplace Handoff

Step: 258

## Summary

Steps 244-258 completed a security and marketplace foundation audit/planning pass. No production database, deployment, push, forced dependency fix, or broad fallback removal was performed.

## Current Auth State

- Backend uses Bearer JWT auth.
- Access tokens expire after 15 minutes.
- Refresh tokens expire after 7 days and are stored on the user row.
- Refresh token rotation exists.
- Browser apps still rely on client-side token storage.
- No httpOnly-cookie auth or CSRF layer exists yet.

## Current Permission State

- Route-level auth and role middleware exist.
- Lab order ownership checks are implemented in services.
- Marketplace service has ownership checks for listing edit/status, conversations, and sales.
- DTOs are service-local and not centralized.

## Marketplace Exposure Findings

- Marketplace browse/detail currently requires auth.
- New marketplace DTOs are shaped and avoid direct secret leakage.
- Legacy listing DTO spreads raw payload and should be replaced with allowlist DTOs before anonymous public browsing.
- Marketplace media currently uses URLs, not backend-managed upload/storage.
- Messaging has basic participant checks but needs anti-spam, moderation, reporting, and rate limits.

## Reports Created

- `AUTH_AND_PERMISSION_AUDIT.md`
- `HTTP_ONLY_AUTH_STRATEGY_PLAN.md`
- `PERMISSION_AND_OWNERSHIP_HARDENING_PLAN.md`
- `CSRF_AND_SESSION_PROTECTION_PLAN.md`
- `RATE_LIMITING_AND_ABUSE_PROTECTION_PLAN.md`
- `UPLOAD_AND_MEDIA_SECURITY_PLAN.md`
- `AUDIT_LOGGING_AND_SECURITY_EVENTS_PLAN.md`
- `MARKETPLACE_PUBLIC_EXPOSURE_AUDIT.md`
- `PUBLIC_SAFE_MARKETPLACE_DTO_PLAN.md`
- `MARKETPLACE_MEDIA_ARCHITECTURE_PLAN.md`
- `MARKETPLACE_MESSAGING_SECURITY_PLAN.md`
- `SECURITY_TEST_STRATEGY_PLAN.md`
- `STAGING_ENVIRONMENT_ARCHITECTURE_PLAN.md`
- `SECURITY_PHASE_GIT_REVIEW.md`

## Recommended Next Steps

1. Commit or otherwise isolate deterministic E2E and dependency/CI work before security implementation.
2. Implement centralized marketplace public DTO allowlists and tests.
3. Add permission helper modules and tests for ownership boundaries.
4. Add cookie/CSRF auth in a dual-mode migration.
5. Add messaging, QR, upload, and auth abuse limiters.
6. Design backend-owned media storage before accepting marketplace uploads.

## Do Not Do Yet

- Do not deploy.
- Do not push without explicit approval.
- Do not use production data.
- Do not run `npm audit fix --force`.
- Do not expose tokens, secrets, passwords, or `.env` contents.
