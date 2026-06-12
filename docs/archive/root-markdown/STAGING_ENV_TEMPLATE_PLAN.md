# Staging Env Template Plan

## Backend Variables
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `NODE_ENV=production`
- `UPLOAD_STORAGE_DIR` or object storage credentials
- `MAX_UPLOAD_BYTES`

## Frontend Variables
- `VITE_API_URL`
- App-specific public URLs for breeder/lab/admin/marketplace.

## Secret Rules
- No production secrets in staging.
- No local `.env` committed.
- Rotate staging secrets before public testing.

