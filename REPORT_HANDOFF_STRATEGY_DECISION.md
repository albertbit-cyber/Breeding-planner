# Report Handoff Strategy Decision

Date: 2026-05-21

## Decision

Keep the staging runtime review branch focused on executable deployment changes. Do not commit the full historical report set to this branch.

## Retention Policy

Use three report tiers:

1. Runtime branch reports
   - Include only concise reports that explain the current deployment branch, commit set, validation, staging blockers, and final handoff.

2. Local workspace history
   - Keep the large historical `*_REPORT.md`, `*_PLAN.md`, and older `CHATGPT_*HANDOFF.md` files in the local workspace unless a dedicated docs/archive branch is requested.

3. Future docs/archive branch
   - If long-term architecture history needs versioning, create a separate docs branch or docs folder later, outside the staging runtime branch.

## Candidate Reports For Runtime Branch

- `STAGING_RUNTIME_BRANCH_REPORT.md`
- `RUNTIME_CODE_COMMIT_REPORT.md`
- `DATABASE_MIGRATION_COMMIT_EXECUTION_REPORT.md`
- `DETERMINISTIC_E2E_CI_COMMIT_EXECUTION_REPORT.md`
- `REPORT_HANDOFF_STRATEGY_DECISION.md`
- `FINAL_LOCAL_PRE_DEPLOYMENT_VALIDATION.md`
- final staging/prod handoff reports created after real staging execution

## Excluded By Default

- bulk historical reports and plans
- local editor/tool settings
- generated artifacts
- logs, zips, `.env*`, and `.tools/`

## Push Status

No push was performed.

