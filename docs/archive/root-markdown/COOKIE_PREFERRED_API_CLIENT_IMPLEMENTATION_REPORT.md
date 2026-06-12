# Cookie Preferred API Client Implementation Report

## Changed Files
- `breeding-app-breeder/src/shared/apiClient.ts`
- `breeding-app-lab/src/shared/apiClient.ts`
- `breeding-app-admin/src/shared/apiClient.ts`
- `breeding-app-marketplace/src/shared/apiClient.ts`
- `breeding-app-shared/src/shared/apiClient.ts`
- `src/shared/apiClient.ts`

## What Changed
- Added cookie auth mode keys and CSRF token keys for breeder/lab/admin scopes.
- Added `fetchCsrfToken`.
- Added `credentials: "include"` to backend requests and refresh calls.
- Refresh now works with either refresh-token body or httpOnly refresh cookie.
- Unsafe requests add `x-csrf-token` only when the client is in cookie-preferred authenticated mode.
- Bearer fallback remains available and is used once after a cookie-preferred `401`.

## Validation
- All frontend package tests passed after tightening CSRF behavior.
- Breeder, lab, admin, marketplace, shared, and root builds passed.

