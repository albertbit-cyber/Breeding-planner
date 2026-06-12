# First Real Deployment Execution Plan

Date: 2026-05-21

## Status

Prepared only. No real deployment was executed.

## Preconditions

Must be complete before execution:

- Railway staging backend service created
- Supabase staging PostgreSQL created
- Netlify lab and breeder sites created
- staging secrets configured
- staging API and frontend URLs known
- backup/restore checkpoint available for staging database
- monitoring target ready
- deployment approval granted

## Execution Order

1. Confirm branch and commits:
   - `staging/runtime-review-20260521`
   - `a37644f`
   - `9560ed3`
   - `dfb86a2`
2. Configure Supabase staging database.
3. Configure Railway backend variables.
4. Deploy Railway backend.
5. Confirm Prisma migration completed on staging only.
6. Smoke test `GET /api/health`.
7. Configure Netlify lab `VITE_API_URL`.
8. Deploy Netlify lab site.
9. Configure Netlify breeder `VITE_API_URL`.
10. Deploy Netlify breeder site.
11. Update Railway `CORS_ORIGIN` with final Netlify origins.
12. Redeploy backend if CORS changed.
13. Run backend smoke tests.
14. Run frontend smoke tests.
15. Decide whether staging E2E reset is safe.
16. Run staging live E2E or an approved non-destructive staging subset.
17. Activate monitoring.
18. Validate rollback procedure.
19. Produce final staging acceptance report.

## Stop Conditions

- any production URL appears in staging config
- migration targets non-staging database
- health endpoint fails
- login/session refresh fails
- upload storage writes fail
- lab or breeder core workflow fails
- rollback checkpoint is missing before migration

## No-Push Note

The branch has not been pushed from this workspace. Provider deployment from GitHub requires pushing the branch or selecting an already available branch/commit.

