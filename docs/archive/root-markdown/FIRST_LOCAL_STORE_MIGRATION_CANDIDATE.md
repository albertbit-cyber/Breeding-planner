# First Local Store Migration Candidate

Date: 2026-05-16
Scope: Step 48.

## Chosen Candidate

Lab catalog and pricing reads.

Affected frontend behavior:

- breeder/lab UI needs to list available shed/genetic tests
- breeder/lab UI needs active pricing configuration
- order price calculation depends on catalog/pricing data

## Why This Is Safest

- It is mostly read-only.
- Backend routes already exist.
- Hosted frontend API clients already contain backend calls for this path.
- It avoids high-risk workflows like result entry, certificate generation, sample intake, genetics mutation, and order state transitions.

## Existing Backend Routes

- `GET /api/lab/tests/catalog?breederView=true`
- `GET /api/lab/tests/catalog?breederView=false`
- `GET /api/lab/tests/pricing`
- `POST /api/lab/orders/calculate-price`

## Existing Frontend Backend Path

Both breeder and lab split apps contain hosted API client support in:

- `breeding-app-breeder/src/features/lab/api/client.ts`
- `breeding-app-lab/src/features/lab/api/client.ts`

The hosted client already calls backend catalog/pricing/order price endpoints.

## Remaining Local Store Paths

Local fallback/service code still imports:

- `listAvailableTestRecordsByLabId`
- `listBreederVisibleTestRecords`

from:

- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-lab/src/db/labStore.ts`

## Rollback Plan

- Keep existing local fallback code until the hosted API path is proven in the full app.
- If the backend API fails, switch the feature flag/session mode back to the local handler path.

