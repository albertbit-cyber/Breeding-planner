# Breeder Playwright Dependency Fix Report

Step: 233

## Implemented

- Changed breeder `@capacitor/preferences` from `^8.1.0` to `^8.0.1`.
- Added breeder-local `@playwright/test@^1.60.0`.
- Changed breeder scripts to use local Playwright:
  - `test:e2e`
  - `test:e2e:ui`
  - `test:e2e:reset`
- Updated `breeding-app-breeder/playwright.config.mjs` to import from `@playwright/test`.
- Updated breeder E2E specs/helpers to import Playwright from `@playwright/test`.

## Verification

- Breeder install now succeeds.
- Breeder E2E now runs through breeder's own Playwright install.
- `npm.cmd run test:e2e:reset` in breeder passed: 9 tests.

## Extra Fix

The seeded-snake editor helper was made more deterministic by filtering the animal list to `Athena - DEMO` before clicking Edit.
