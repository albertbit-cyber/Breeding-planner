# ChatGPT Sample QR Handoff

Date: 2026-05-18

## What Was Done

- Continued from step 151 through step 168.
- Inspected sample intake and QR lookup flows.
- Confirmed there is no dedicated shared backend sample/QR lookup route yet.
- Added Playwright coverage for current shared-mode behavior:
  - sample ID lookup
  - QR payload lookup
  - malformed input blocked before backend lookup
  - intake submission updates backend order status
- Added helper support for deterministic synthetic sample IDs and QR tokens.
- Cached Playwright API login tokens to avoid local auth rate limiting in the full E2E suite.
- Ran the full local quality gate.

## Code/Test Files Changed

- `breeding-app-lab/tests/e2e/helpers.ts`
- `breeding-app-lab/tests/e2e/order-test-helpers.ts`
- `breeding-app-lab/tests/e2e/lab-sample-qr.spec.ts`

## Verification

- Backend tests passed: 60 tests.
- Backend build passed.
- Lab unit tests passed: 56 tests.
- Lab build passed.
- Sample/QR Playwright spec passed.
- Full Lab Playwright E2E passed: 16 tests.

## Known Warnings

- PDF font fallback warning remains in Lab unit test runtime.
- Lab build circular vendor chunk warning remains.
- Prisma `package.json#prisma` deprecation warning remains during Playwright backend startup.
- Dependency audit findings remain; no force fixes were applied.

## Important Finding

Sample and QR lookup in shared mode is frontend-derived from backend order data. A dedicated backend sample/QR lookup API should be added later for stronger authorization, cleaner contracts, and simpler testing.

## Recommended Next Step

Plan the breeder-facing lab workflow slice next:

1. Inspect breeder shed testing panel and breeder lab API paths.
2. Cover breeder order visibility and/or order creation.
3. Cover breeder label download and certificate/result visibility if stable.
4. Run the full quality gate.
5. Create the next handoff.

## Do Not Do Yet

- Do not deploy.
- Do not push without explicit approval.
- Do not use production database.
- Do not commit `.env` files.
- Do not commit Playwright auth state, reports, traces, videos, screenshots, downloads, or generated build output.
- Do not remove broad fallback modules without a dedicated migration proof.

