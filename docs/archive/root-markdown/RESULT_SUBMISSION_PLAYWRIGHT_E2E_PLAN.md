# Result Submission Playwright E2E Plan

## Scenario

Submit a completed lab result from the order detail page.

## Assertions

- Seeded order opens from local backend.
- Every result row can be filled.
- Submit makes a `POST /results/submit` backend call.
- Response mode is `submit`.
- Order status becomes `completed`.
- Completed order UI shows certificate download and submitted summary.

