# Marketplace Abuse Limiter Implementation Report

## Changed Files
- `breeding-app-backend/src/middleware/rateLimiters.ts`
- `breeding-app-backend/src/routes/marketplaceRoutes.ts`
- `breeding-app-backend/src/routes/listingRoutes.ts`

## What Changed
- Added production-only limiters:
  - `marketplaceMutationLimiter`
  - `marketplaceMessageLimiter`
  - `marketplaceQrLimiter`
  - `marketplaceUploadLimiter`
- Applied mutation limiter to listing/store/sale/review/admin marketplace write routes.
- Applied message limiter to conversation creation and message send routes.
- Applied mutation limiter to legacy listing write routes.

## Notes
Limiters are skipped outside production to preserve deterministic local and E2E tests.

