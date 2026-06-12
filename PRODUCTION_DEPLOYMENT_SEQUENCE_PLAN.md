# Production Deployment Sequence Plan

Date: 2026-05-20

## Sequence

1. Clean and commit current work.
2. Deploy and verify staging.
3. Run staging smoke tests.
4. Run staging live E2E.
5. Review production readiness.
6. Provision production database/storage/secrets.
7. Deploy production backend.
8. Apply production migrations after backup.
9. Verify production backend health.
10. Deploy production frontends.
11. Run production smoke tests.
12. Monitor logs and alerts.

## Rollback

- Roll back frontends first if UI/API compatibility fails.
- Roll back backend artifact if runtime fails before destructive migrations.
- Restore database backup only for severe data corruption.
- Preserve incident notes and exact deployment versions.

