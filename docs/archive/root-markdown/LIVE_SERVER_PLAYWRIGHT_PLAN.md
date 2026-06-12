# Live Server Playwright Plan

## Goal
Run browser E2E against live local backend/frontend servers before staging.

## Existing Runtime
- Lab Playwright config starts/reuses backend on `4000` and lab frontend on `4173`.
- Breeder Playwright config starts/reuses backend on `4000` and breeder frontend on `4174`.

## Plan
- Reset local E2E database.
- Run lab E2E.
- Run breeder E2E.
- Preserve traces/videos/screenshots on failure.

