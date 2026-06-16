# Frontend Deployment Runtime Plan

Date: 2026-05-20

## Apps

- Breeder frontend.
- Lab frontend.

## Environment Injection

Set staging API URL at build/deploy time:

```env
VITE_API_URL=<https-staging-api>/api
```

## Auth Compatibility

- Preserve cookie-preferred auth.
- Preserve Bearer fallback until staging proves full cookie flow.
- Backend `CORS_ORIGIN` must include staging frontend origins.

## Cache Rules

- Long-cache hashed assets.
- Short-cache or no-cache `index.html`.
- Invalidate frontend CDN after deployment.

