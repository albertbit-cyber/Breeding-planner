# Playwright Dependency Install Report

Date: 2026-05-17

## Changes

- Installed `@playwright/test` in `breeding-app-lab`.
- Installed the Chromium browser used by the local E2E suite.
- Added Lab app scripts:
  - `npm.cmd run test:e2e`
  - `npm.cmd run test:e2e:ui`

## Files Changed

- `breeding-app-lab/package.json`
- `breeding-app-lab/package-lock.json`

## Notes

- `npm install` reported existing dependency audit findings: 5 moderate and 1 critical vulnerability.
- No automatic audit fix was applied because forced fixes can change dependency behavior and need a separate review.
