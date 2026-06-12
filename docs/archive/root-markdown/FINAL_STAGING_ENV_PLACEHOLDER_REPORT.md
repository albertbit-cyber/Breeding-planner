# Final Staging Env Placeholder Report

Date: 2026-05-20

## Backend Placeholders

```env
NODE_ENV=production
DATABASE_URL=<staging-postgres-url>
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=<https-lab-staging>,<https-breeder-staging>,<https-marketplace-staging>,<https-admin-staging>
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
MAX_UPLOAD_BYTES=5242880
JSON_BODY_LIMIT=8mb
UPLOAD_STORAGE_DIR=<staging-upload-volume-or-storage-path>
```

## Frontend Placeholders

```env
VITE_API_URL=<https-staging-api>/api
```

## E2E Placeholders

```env
E2E_BACKEND_URL=<https-staging-api>
E2E_LAB_FRONTEND_URL=<https-lab-staging>
E2E_BREEDER_FRONTEND_URL=<https-breeder-staging>
```

## Safety

No real secrets, tokens, or credentials were written.

