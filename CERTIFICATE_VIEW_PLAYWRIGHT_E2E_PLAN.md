# Certificate View Playwright E2E Plan

## Scenario

Use local PostgreSQL and the seeded order to create a completed result, open the completed order detail page, click `View Certificate`, and verify the UI creates a blob PDF view.

## Setup

- Login by API using local E2E lab credentials.
- Reset seeded order `05AA00001` to `in_progress`.
- Mark payment paid.
- Submit a complete negative result through the backend API.

## Assertions

- Completed order detail opens.
- Certificate card shows certificate number and verification text.
- Clicking `View Certificate` produces a blob URL through `window.open`.
- No browser console errors are emitted.

