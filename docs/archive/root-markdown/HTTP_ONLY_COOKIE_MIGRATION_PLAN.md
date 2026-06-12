# HTTP Only Cookie Migration Plan

Step: 260

## Goal

Move browser authentication from localStorage-held tokens to secure httpOnly cookies without breaking current Breeder, Lab, Admin, deterministic E2E, or API client flows.

## Migration Strategy

- Keep Bearer JWT support during migration.
- Add backend-set httpOnly access and refresh cookies on login and refresh.
- Add a readable CSRF token cookie plus `x-csrf-token` request header for cookie-authenticated write requests.
- Add logout that clears auth cookies and revokes the stored refresh token.
- Update browser clients later to prefer cookie mode while keeping Bearer fallback until E2E and staging are proven.

## Non-Goals

- No production database use.
- No token or secret exposure.
- No deployment or push.
- No removal of existing localStorage/Bearer auth yet.

