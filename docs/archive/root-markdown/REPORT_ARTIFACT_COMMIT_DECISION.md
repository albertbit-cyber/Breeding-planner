# Report Artifact Commit Decision

Date: 2026-05-21

## Decision

Do not include the full bulk report set in the runtime deployment branch by default.

## Include If Approved

Include only concise deployment/staging context:

- `DEPLOYMENT_DIRTY_WORKTREE_REVIEW.md`
- `LOCAL_ARTIFACT_EXCLUSION_REPORT.md`
- `RUNTIME_ONLY_STAGING_COMMIT_PLAN.md`
- `CHATGPT_STAGING_DEPLOYMENT_HANDOFF.md`

## Exclude By Default

- historical `*_REPORT.md`
- historical `*_PLAN.md`
- older `CHATGPT_*HANDOFF.md` files not required for reviewer context

## Reason

The dirty worktree contains hundreds of report files. Keeping the deployment branch runtime-focused improves reviewability and reduces deployment noise.

