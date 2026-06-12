# Staging Frontend Env Setup

Date: 2026-05-20

## Breeder And Lab Frontends

Set the API URL at build/deploy time:

```env
VITE_API_URL=<https-staging-api>/api
```

## Backend CORS

Add deployed staging frontend URLs to backend `CORS_ORIGIN`.

## Validation

After deploy:

- Login works.
- Cookie auth works.
- Bearer fallback remains compatible.
- API requests target staging, not local or production.

