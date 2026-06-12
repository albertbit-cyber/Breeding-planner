# Final Staging Env Template Report

Date: 2026-05-20

## Current Local Runtime Assumptions

- Database: local PostgreSQL.
- Database name observed in reset: `breeding_planner_local`.
- Backend CORS allows local development origins outside production.
- Cookie-preferred auth and Bearer fallback are both still supported.
- JSON body limit can now be set with `JSON_BODY_LIMIT`; default is `8mb`.

## Staging Variables To Confirm

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `NODE_ENV=production`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE`
- `CSRF_SECRET` if used by the deployed auth runtime
- `UPLOAD_STORAGE_DIR` or cloud storage replacement settings
- `MAX_UPLOAD_BYTES`
- `JSON_BODY_LIMIT`

## Note

No production secrets were created or modified in this batch.

