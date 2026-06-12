# Staging Deployment Approval Package

Date: 2026-05-20

## Readiness

Local runtime validation is green.

## Remaining Required Inputs

- Staging PostgreSQL URL.
- Backend hosting target.
- Lab frontend hosting target.
- Breeder frontend hosting target.
- Staging secret manager.
- Deployment approval.

## Risks

- Dirty worktree not yet committed.
- Large local artifacts should not be staged.
- Staging reset strategy must not touch real data.
- Monitoring is planned but not active.

## Rollback

Rollback procedures are documented in `STAGING_ROLLBACK_PROCEDURES.md`.

## Approval Status

Not approved for deployment yet.

