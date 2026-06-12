# Deterministic Lab Fixtures Plan

Step: 218

## Plan

Use one stable lab account and one stable baseline order for lab UI and API E2E.

## Fixtures

- Lab user: `lab@proherper.dev`.
- Baseline order: `05AA00001`.
- Baseline order status after reset: `submitted`.
- Baseline payment status after reset: `pending`.

## Expected Test Behavior

Tests may move the order between submitted, received, in-progress, paid, and completed states during a run. A new `test:e2e:reset` run returns it to the baseline state.
