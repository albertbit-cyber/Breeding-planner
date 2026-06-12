# Next Sample QR Workflow Plan

## Recommended Next Slice

Sample and QR lookup workflow.

## Why

Order list, order detail, status/payment, result entry, and certificate view/download now have local PostgreSQL E2E coverage. Sample/QR lookup is the next lab workflow that connects intake, labels, and order operations.

## Suggested Scope

1. Inspect sample intake page and QR/sample lookup client methods.
2. Confirm backend endpoints for resolving QR tokens and sample IDs.
3. Add backend tests for lookup success, unauthorized access, missing sample, and malformed QR input.
4. Add Playwright E2E for seeded sample ID lookup.
5. Add Playwright E2E for seeded QR token lookup if stable seeded QR data exists.
6. Run backend tests/build, Lab tests/build, and full Lab E2E.

## Risks

- Seeded QR token must be stable or discoverable from backend order detail.
- QR scanner browser APIs may need to be bypassed in E2E by using manual text lookup.
- Avoid committing generated labels, QR images, screenshots, videos, or traces.

