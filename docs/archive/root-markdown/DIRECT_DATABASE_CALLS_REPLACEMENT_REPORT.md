# Direct Database Calls Replacement Report

Generated for Step 24.

## Summary

No source replacements were made in this pass.

Reason:

- No frontend app contains direct PostgreSQL/Supabase secret access.
- The direct local store dependencies are Node/SQLite helper modules copied from the original app into breeder/lab for build compatibility.
- Replacing those imports requires feature-by-feature backend route mapping and regression testing.

## Current State

| App | Status |
| --- | --- |
| Breeder | Builds, but still contains copied local lab/cache store and lab services. |
| Admin | No direct database calls found in frontend source. |
| Lab | Builds, but still contains copied local lab/cache store and lab services. |
| Marketplace | No direct database calls found in frontend source. |

## Next Replacement Work

- Convert lab app `src/features/lab/api/*` handlers from local service calls to `src/shared/apiClient.ts` backend calls.
- Remove `src/db/labStore.ts` and `src/db/cache.ts` from frontend apps after backend route coverage is complete.
- Keep all database access in `breeding-app-backend`.
- Re-run frontend builds/tests after each feature group is migrated.

