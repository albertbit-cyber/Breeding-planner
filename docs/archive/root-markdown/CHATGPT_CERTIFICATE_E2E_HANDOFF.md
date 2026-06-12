# ChatGPT Certificate E2E Handoff

Date: 2026-05-18

## What Was Done

- Continued from step 137 through step 150.
- Inspected the certificate workflow.
- Confirmed there is no dedicated shared backend certificate artifact route yet.
- Added Playwright coverage for the currently implemented certificate behavior:
  - view certificate from a completed seeded order
  - download certificate PDF from a completed seeded order
- Expanded E2E order helpers to submit a completed negative result through existing backend result APIs.
- Ran the full local quality gate.
- Created reports for audit, plans, implementation, fallback review, dependency audit, Git review, and handoff.

## Code/Test Files Changed

- `breeding-app-lab/tests/e2e/order-test-helpers.ts`
- `breeding-app-lab/tests/e2e/lab-certificate.spec.ts`

## Verification

- Backend tests passed: 60 tests.
- Backend build passed.
- Lab unit tests passed: 56 tests.
- Lab build passed.
- Certificate Playwright spec passed.
- Full Lab Playwright E2E passed: 13 tests.

## Known Warnings

- PDF font fallback warning remains in Lab unit test runtime.
- Lab build circular vendor chunk warning remains.
- Prisma `package.json#prisma` deprecation warning remains during Playwright backend startup.
- Dependency audit findings remain; no force fixes were applied.

## Important Finding

Certificate PDF generation in shared mode is still frontend-side. The frontend uses backend order/result data, builds the certificate template, renders the PDF, then opens/downloads a blob. A future backend route should own PDF artifact generation and authorization.

## Recommended Next Step

Plan and implement the sample/QR workflow slice next.

Suggested next tasks:

1. Inspect sample intake and QR/sample lookup flows.
2. Confirm backend endpoints and seeded sample/QR data.
3. Add backend lookup tests.
4. Add Playwright E2E for sample ID lookup and QR token lookup where stable.
5. Run the full quality gate and create the next handoff.

## Do Not Do Yet

- Do not deploy.
- Do not push without explicit approval.
- Do not use production database.
- Do not commit `.env` files.
- Do not commit Playwright auth state, reports, traces, videos, screenshots, downloads, or generated build output.
- Do not remove broad fallback modules without a dedicated migration proof.

