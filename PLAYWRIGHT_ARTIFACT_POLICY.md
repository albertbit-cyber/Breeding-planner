# Playwright Artifact Policy

Step: 226

## Current Policy

Both Lab and Breeder Playwright configs use:

- traces: retain on failure.
- videos: retain on failure.
- screenshots: only on failure.
- HTML reports: generated under `playwright-report`.

## Git Policy

Do not commit:

- `playwright-report/`
- `test-results/`
- browser auth states under `playwright/.auth/`
- downloaded PDFs or screenshots generated during local runs.

## Recommendation

Keep failure artifacts in CI as temporary uploaded artifacts with a short retention window.
