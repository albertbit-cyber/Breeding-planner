# CI Artifact Policy

Step: 238

## Policy

- Commit no Playwright auth state, screenshots, videos, traces, downloaded PDFs, or reports.
- Upload Playwright reports only on CI failure.
- Keep CI artifact retention short: 7 days.
- Continue ignoring local artifact folders:
  - `breeding-app-lab/playwright/.auth`
  - `breeding-app-lab/playwright-report`
  - `breeding-app-lab/test-results`
  - `breeding-app-breeder/playwright/.auth`
  - `breeding-app-breeder/playwright-report`
  - `breeding-app-breeder/test-results`

## Current Workflow

`.github/workflows/dependency-ci.yml` uploads failure artifacts from Lab and Breeder only when the job fails.
