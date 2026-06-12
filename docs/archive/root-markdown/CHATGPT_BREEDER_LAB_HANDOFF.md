# ChatGPT Breeder Lab Handoff

## Summary

Steps 169-190 were completed as a breeder-facing lab workflow slice. Backend contracts were hardened with tests, breeder-facing API/E2E coverage was added through the existing Playwright runner, quality gates were run, and unsupported browser-only work was documented.

## Code Changes

- Added `breeding-app-backend/src/tests/orderServiceVisibility.test.ts`.
- Extended `breeding-app-backend/src/tests/orderRoutes.test.ts` for breeder order creation.
- Added breeder API login helper to `breeding-app-lab/tests/e2e/helpers.ts`.
- Added `breeding-app-lab/tests/e2e/breeder-lab-workflow.spec.ts`.
- Removed duplicate nested breeder lab component copies under `breeding-app-breeder/src/features/lab/components/components`.

## Verified Behavior

- Breeders list only their own lab orders.
- Breeders can open own order detail.
- Breeders are blocked from foreign order detail at service level.
- Buyers are blocked from lab order workflows.
- Lab staff/admin visibility remains preserved.
- Breeders can create lab orders through backend route.
- Breeders can see completed result data for owned orders.

## Quality Gate

- Backend full test: 68 passed.
- Backend build: passed.
- Lab unit test: 56 passed.
- Lab build: passed.
- Lab full E2E: 19 passed.
- Breeder unit test: 44 passed.
- Breeder build: passed.
- Shared test: 40 passed.
- Shared build: passed.
- Breeder build/test were rerun after duplicate component cleanup and still passed.

## Known Warnings

- Prisma `package.json#prisma` deprecation warning during Playwright backend startup.
- Lab PDF font fallback warning in Vitest.
- Lab circular vendor chunk warning.
- Breeder `pdfjs-dist` eval warning.
- Backend and Lab npm audits report vulnerabilities; Breeder/Shared audits need lockfiles.

## Not Done

- Dedicated breeder browser Playwright runner.
- Browser-level breeder certificate PDF view/download assertions.
- Browser-level breeder label PDF preview/download assertions.
- Dependency upgrades or audit fixes.
- Commit, push, or deploy.

## Recommended Next Step

Create a dedicated breeder Playwright runner that starts `breeding-app-breeder`, logs in as seeded breeder, and covers:

1. Breeder lab order list/detail UI.
2. Breeder order creation from UI.
3. Label preview/download from UI.
4. Certificate view/download from UI after lab completion.

After that, revisit fallback removal with browser proof.
