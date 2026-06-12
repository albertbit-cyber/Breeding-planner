# Staging Environment Variable Template Report

Date: 2026-05-20

## Backend Staging Variables

Use placeholders only:

```env
NODE_ENV=production
DATABASE_URL=<staging-postgres-url>
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=<comma-separated-https-frontend-origins>
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
MAX_UPLOAD_BYTES=5242880
JSON_BODY_LIMIT=8mb
UPLOAD_STORAGE_DIR=<staging-upload-storage-path-or-volume>
```

## E2E Variables

```env
E2E_BACKEND_URL=<staging-api-url>
E2E_LAB_FRONTEND_URL=<staging-lab-url>
E2E_BREEDER_FRONTEND_URL=<staging-breeder-url>
```

## Safety

No real secrets were written in this batch.

