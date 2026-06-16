# ChatGPT Handoff: Lab Order E2E Steps 105-118

Date: 2026-05-17

Repository: `D:\Git Clone\Breeding-planner`

Branch: `all-branches-merged`

## Purpose

This handoff summarizes the Lab order E2E continuation stage after steps 91-104. It covers steps 105-118: audit, planning, implementation, quality gate, fallback cleanup review, dependency audit review, Git review, and recommended next work.

## What Was Added

Added:

- `breeding-app-lab/tests/e2e/lab-order-detail-status-payment.spec.ts`

The new Playwright spec covers:

- Opening seeded order `05AA00001` from the Lab order list.
- Verifying the order detail page loads through `GET /api/lab/orders/:id`.
- Updating workflow status through the UI and verifying `PATCH /api/lab/orders/:id/status`.
- Updating payment through the UI and verifying `PATCH /api/lab/orders/:id/payment`.

## What Was Changed

Changed:

- `breeding-app-lab/src/features/lab/api/client.ts`

Removed one unused import from `./testOrderHandlers`. This is a narrow fallback cleanup only. The local store and handler modules remain in place.

## Verification

Specific order spec:

- Passed, 4 tests including Playwright setup.

Full Playwright E2E:

- Passed, 9 tests.

Quality gate:

- Backend targeted tests passed: 24 tests.
- Backend TypeScript build passed.
- Lab unit tests passed: 56 tests.
- Lab production build passed.
- Lab Playwright E2E passed: 9 tests.

## Dependency Audit Summary

No fixes were applied.

Lab:

- `jspdf -> dompurify` production finding remains.
- Vite/Vitest/esbuild dev-tooling findings remain.
- `npm audit fix --force` would introduce breaking upgrades.

Backend:

- `npm audit --omit=dev` reports fixable findings including `defu`, `effect` through Prisma tooling, `ip-address` through `express-rate-limit`, and `path-to-regexp`.
- Do not apply fixes without a dedicated dependency pass and full regression testing.

## Known Warnings

- Lab unit tests still log the existing PDF font fallback warning.
- Lab build still logs the existing circular chunk warning.
- Backend startup still logs Prisma `package.json#prisma` deprecation.
- Git still logs global ignore permission warning.

## Remaining Local Fallback Work

Do not delete broad local fallback modules yet.

Still present and needed for unmigrated workflows:

- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/services/lab/testOrderService.ts`
- `breeding-app-lab/src/features/lab/api/testOrderHandlers.ts`
- result entry/finalization services
- certificate services
- sample lookup
- shed terminal
- shipment labels
- admin oversight

## Recommended Next Step

Next safest Lab workflow slice:

- Result entry draft and result submission.

Suggested prompt:

```text
Read CHATGPT_LAB_ORDER_E2E_HANDOFF.md and CHATGPT_FULL_PROJECT_HANDOFF_STEP_1_TO_104.md.

Continue with the next safe Lab workflow slice:
- Add backend-backed Playwright coverage for result draft and result submission using the local seeded order.
- Use local PostgreSQL only.
- Do not print secrets.
- Do not remove broad local fallback modules yet.
- Reset local seeded order state before mutable tests.
- Run backend targeted tests/build, Lab tests/build, and Lab Playwright E2E.
- Create a new handoff report.
```

## Do Not Do Without Approval

- Do not push.
- Do not deploy.
- Do not use production database.
- Do not commit `.env` files.
- Do not commit Playwright auth/report/test-result artifacts.
- Do not run `npm audit fix --force`.
- Do not delete `db/labStore` or broad fallback modules.
- Do not change auth token storage strategy.
