# Direct Database Calls Audit

Generated for Step 24.

## Scope

Audited frontend split folders:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`

Searched for:

- Supabase clients and service-role keys.
- Direct PostgreSQL connection strings.
- Prisma client usage.
- Database environment variables.
- Local SQLite helpers.
- `better-sqlite3`.
- `LAB_DB_PATH` and `CACHE_DB_PATH`.

## Summary

No frontend app currently contains obvious Supabase service-role usage, direct PostgreSQL connection strings, Prisma client imports, or database passwords.

Direct local database-style dependencies were found in copied breeder and lab source:

- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-breeder/src/db/cache.ts`
- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/db/cache.ts`

These use local SQLite through `better-sqlite3` and environment variables such as `LAB_DB_PATH` and `CACHE_DB_PATH`. They are not shared PostgreSQL credentials, but they are still direct frontend/app data-store dependencies and should be replaced by backend API calls or moved to backend-only code.

## Findings

| App | Finding | Current paths | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| Breeder | Local lab/cache store copied into app | `src/db/labStore.ts`, `src/db/cache.ts`, `src/services/lab/*`, `src/features/lab/api/client.ts` | Breeder frontend can still carry local lab persistence logic and Node-only dependencies. | Keep breeder using backend API for lab order creation and remove local lab store after API migration. |
| Lab | Local lab/cache store copied into app | `src/db/labStore.ts`, `src/db/cache.ts`, `src/services/lab/*`, `src/features/lab/api/*` | Lab app still has local SQLite service logic instead of relying entirely on backend. | Move mutation/query authority to `breeding-app-backend`; keep only API client and UI state in lab app. |
| Admin | No direct database calls found in frontend source | N/A | Low | Continue using backend API only. |
| Marketplace | No direct database calls found in frontend source | N/A | Low | Continue using backend API only. |

## Search Notes

The audit found many false positives for `Array.from(...)`; those are normal JavaScript collection operations and not database calls.

No matches were found for:

- frontend `DATABASE_URL`
- frontend Prisma client imports
- frontend Supabase service-role keys
- frontend PostgreSQL connection strings

## Direct Local Store Dependencies To Remove Later

Breeder:

- `breeding-app-breeder/src/db/labStore.ts`
- `breeding-app-breeder/src/db/cache.ts`
- `breeding-app-breeder/src/services/lab/*`
- `breeding-app-breeder/src/features/lab/api/client.ts` imports local lab services.

Lab:

- `breeding-app-lab/src/db/labStore.ts`
- `breeding-app-lab/src/db/cache.ts`
- `breeding-app-lab/src/services/lab/*`
- `breeding-app-lab/src/features/lab/api/*` imports local lab services/handlers.

## Replacement Decision

No direct database calls were replaced in this pass.

Reason:

- The copied apps currently build and tests pass.
- The local lab store/service layer is intertwined with lab UI handlers.
- Replacing it safely requires a backend route/client migration by feature group, not a blind import rewrite.
- Some backend routes already exist, but frontend handler modules still depend on local service behavior and local test data.

The required endpoint work is documented in `MISSING_BACKEND_ENDPOINTS.md`.

