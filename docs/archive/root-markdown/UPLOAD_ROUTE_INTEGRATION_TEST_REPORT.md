# Upload Route Integration Test Report

Date: 2026-05-20

## Added

- `breeding-app-backend/src/tests/marketplaceRuntimeRoutes.test.ts`

## Coverage

- Authenticated breeders can call `POST /api/marketplace/uploads`.
- Buyers are rejected from upload route.
- Authenticated breeders can call `GET /api/marketplace/uploads/me`.

## Validation

- Targeted route tests passed.
- Full backend suite passed with these tests included.

