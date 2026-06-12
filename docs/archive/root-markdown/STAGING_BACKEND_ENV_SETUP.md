# Staging Backend Env Setup

Date: 2026-05-20

## Required Variables

```env
NODE_ENV=production
DATABASE_URL=<staging-postgres-url>
JWT_SECRET=<staging-secret>
CORS_ORIGIN=<comma-separated-staging-frontends>
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
MAX_UPLOAD_BYTES=5242880
JSON_BODY_LIMIT=8mb
UPLOAD_STORAGE_DIR=<staging-upload-path-or-volume>
```

## Rule

Do not commit real values. Use provider secret management.

