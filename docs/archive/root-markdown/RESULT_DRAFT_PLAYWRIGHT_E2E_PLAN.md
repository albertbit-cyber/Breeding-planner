# Result Draft Playwright E2E Plan

## Scenario

Save a partial lab result draft from the order detail page and verify it loads again.

## Assertions

- Seeded order opens from local backend.
- Result entry card is visible.
- Draft save makes a `POST /results/draft` backend call.
- Response mode is `draft`.
- Order moves to `in_progress`.
- Reloaded UI shows the saved test code, selected result status, and summary.

