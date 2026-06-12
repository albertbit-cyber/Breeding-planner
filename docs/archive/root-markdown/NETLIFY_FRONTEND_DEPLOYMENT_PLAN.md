# Netlify Frontend Deployment Plan

Date: 2026-05-21

## Status

Prepared only. No Netlify sites or deployments were created.

## Sites

Create two Netlify staging sites:

- Lab staging site
  - Base/package directory: `breeding-app-lab`
  - Build command: `npm run build`
  - Publish directory: `build`

- Breeder staging site
  - Base/package directory: `breeding-app-breeder`
  - Build command: `npm run build`
  - Publish directory: `build`

## Required Environment Variables

Set in Netlify UI, CLI, or API for each staging site:

- `VITE_API_URL=<railway-staging-api-url>/api`

Do not set production API URLs on staging sites.

## Backend Coupling

After Netlify creates staging domains:

1. Add both Netlify origins to Railway backend `CORS_ORIGIN`.
2. Keep `COOKIE_SECURE=true`.
3. Keep `COOKIE_SAME_SITE=none` for cross-site staging auth if the API and frontends are on different domains.
4. Redeploy backend after CORS origin updates.

## Routing

Because both apps are Vite single-page apps, configure SPA fallback behavior if Netlify does not infer it from the build setup.

Recommended `_redirects` behavior:

```text
/* /index.html 200
```

## Validation

- load lab staging URL
- load breeder staging URL
- verify login reaches Railway staging API
- verify browser cookies/session refresh behavior
- verify no frontend calls local or production API

## Blockers

- no Netlify sites exist
- no Railway staging API URL exists
- no final staging frontend domain names exist

