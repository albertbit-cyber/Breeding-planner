# Git Review After Sample QR

## Current State

The worktree is dirty from this and previous stages. No commit or push was performed.

## Sample/QR Stage Files

- `breeding-app-lab/tests/e2e/lab-sample-qr.spec.ts`
- `breeding-app-lab/tests/e2e/order-test-helpers.ts`
- `breeding-app-lab/tests/e2e/helpers.ts`
- sample/QR report files in repo root.

## Existing Dirty Context

There are many prior untracked reports and earlier E2E setup files. Existing modified app files from previous UI and E2E work remain.

## Do Not Commit

- `.env` files
- Playwright auth state
- Playwright reports
- traces/videos/screenshots
- downloads
- generated build output

## Suggested Commit Grouping

1. E2E helper token caching and sample/QR tests.
2. Sample/QR workflow reports/handoff.
3. Prior result/certificate stage changes separately if committing clean history.

