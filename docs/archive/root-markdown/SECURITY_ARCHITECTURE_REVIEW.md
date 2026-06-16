# Security Architecture Review

Step: 272

## Findings

- Auth is now dual-mode foundation: Bearer remains active and cookies are available.
- Cookie-mode writes have CSRF validation through `requireAuth`.
- Marketplace public exposure now has centralized DTO allowlists.
- Permission helper modules reduce duplicated ownership checks.
- Production auth rate limiters cover login/register/recovery/refresh.

## Remaining Risks

- Refresh tokens are still stored raw.
- Frontend apps still primarily use localStorage tokens.
- Marketplace messaging/upload/QR abuse limiters are not implemented yet.
- Central audit event storage is still planned.

