# Final Release Gate Checklist

Date: 2026-05-20

## Must Pass Before Production

- Dirty git state reviewed and committed.
- Staging PostgreSQL provisioned.
- Staging backend deployed.
- Staging frontends deployed.
- Staging smoke tests passed.
- Staging live E2E passed.
- Production PostgreSQL provisioned and backed up.
- Production upload/media storage provisioned.
- Production secrets injected through provider secret management.
- Monitoring and alerting active.
- Rollback plan tested.
- Legal/compliance checklist approved.

## Current Gate Result

Blocked.

## Reason

Staging has not been deployed or verified, production infrastructure is not provisioned, and the git worktree is still dirty.

