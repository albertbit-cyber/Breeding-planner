# Git Review After Certificate E2E

## Current State

The worktree is dirty from this stage and previous stages. No commit or push was performed.

## Certificate Stage Files

- `breeding-app-lab/tests/e2e/lab-certificate.spec.ts`
- `breeding-app-lab/tests/e2e/order-test-helpers.ts`
- certificate workflow reports in repo root.

## Existing Dirty Context

There are prior modified files and many untracked reports/E2E setup files from earlier stages. Not all dirty files belong to this certificate slice.

## Do Not Commit

- `.env` files
- Playwright auth state
- Playwright reports
- traces/videos/screenshots
- downloaded PDFs
- generated build output

## Suggested Commit Grouping

1. Certificate E2E helper/spec.
2. Certificate workflow reports/handoff.
3. Prior result-entry/backend changes should stay in their own commit if committing history cleanly.

