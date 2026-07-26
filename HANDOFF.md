# Cloud Environment Handoff

## Issue Summary

The project has both Railway `staging` and `production` environments. That is normal, but the current symptoms suggest some deployed apps or builds may be pointed at different backend environments.

Observed symptoms:
- Admin login was posting to the staging backend.
- Cloud database sync previously returned `Internal server error`.
- After backend transaction timeout fixes, sync later showed `Timed out while connecting to the shared backend`.
- Both staging and production backend health endpoints were reachable during local checks.
- The repo contains separate frontend/backend deploy configs and separate Android env files, so a mismatch can happen if one app uses staging while another uses production.

Recent relevant commits already pushed to `staging/runtime-review-20260521`:
- `9c2cccb Fix cloud sync transaction timeout`
- `e7352d4 Fix breeder Railway build install`
- `efc8d90 Increase cloud sync request timeout`

Do not add secrets, passwords, Railway tokens, JWT secrets, or database URLs to this file or to commits.

## Current Branch

```text
staging/runtime-review-20260521
```

## Known Backend URLs To Verify

These URLs are visible from the repo or from prior deploy checks:

```text
Staging Railway health:
https://breeding-planner-staging.up.railway.app/api/health

Production Railway health:
https://breeding-planner-production.up.railway.app/api/health

Android staging env currently uses:
https://staging-api.breedingplanner.dev/api

Android production env currently uses:
https://breeding-planner-production.up.railway.app/api
```

Important: decide which staging backend URL is canonical. If `https://staging-api.breedingplanner.dev/api` is just a custom domain for the staging Railway service, confirm it resolves to the same service as `https://breeding-planner-staging.up.railway.app/api`.

## Expected Environment Mapping

Every app in the same environment must point to the same backend and database.

| App/build | Staging should use | Production should use |
| --- | --- | --- |
| Breeder web app | staging backend `/api` | production backend `/api` |
| Breeder Android APK | staging backend `/api` for staging APK | production backend `/api` for production APK |
| Admin portal | staging backend `/api` | production backend `/api` |
| Lab portal | staging backend `/api` | production backend `/api` |
| Marketplace | staging backend `/api` | production backend `/api` |
| Backend service | staging database | production database |

Do not mix staging frontend with production backend or production frontend with staging backend unless intentionally testing migration behavior.

## Repo Config Findings

Files to inspect:

```text
railway.toml
breeding-app-breeder/railway.toml
breeding-app-backend/railway.toml
breeding-app-admin/railway.toml
breeding-app-admin/netlify.toml
breeding-app-breeder/netlify.toml
.env.android-staging
.env.android-production
```

Important local finding:
- `breeding-app-breeder/railway.toml` has the newer build command:

```text
npm install --no-audit --no-fund && npm run build
```

- Root `railway.toml` still has an older breeder build command:

```text
cd breeding-app-breeder && npm install --omit=optional && npm run build
```

This can cause confusing deploy behavior if one Railway service uses the root config while another uses the app-specific config. Check each Railway service root directory and config source.

## Railway Checklist

Open Railway in Chrome and check the project manually.

For each Railway environment, `staging` and `production`:

1. Confirm all expected services exist:
   - Backend API
   - Breeder frontend, if hosted on Railway
   - Admin frontend, if hosted on Railway
   - Any lab/marketplace services hosted on Railway

2. For every frontend service, verify environment variables:
   - `VITE_API_URL` exists.
   - Staging frontend uses the staging backend URL.
   - Production frontend uses the production backend URL.
   - No frontend has the opposite environment URL.

3. For backend services, verify environment variables:
   - `DATABASE_URL` points to the correct environment database.
   - `CORS_ORIGIN` includes the correct deployed frontend domains for that same environment.
   - Auth/JWT/session secrets are configured.
   - Public API URL variables, if present, point to the same backend environment.

4. Verify service deploy settings:
   - Correct root directory.
   - Correct config file.
   - Correct branch.
   - Correct build command.
   - Correct start command.
   - Backend health check path is `/api/health`.

5. Open each backend health endpoint:
   - Staging should return a healthy JSON response.
   - Production should return a healthy JSON response.

6. If using Railway CLI and it is unauthorized, run `railway login` before checking logs or variables.

## Netlify Checklist

If Admin, Breeder, Lab, or Marketplace are deployed on Netlify, check Netlify separately. Railway variables do not automatically apply to Netlify.

For each Netlify site:

1. Check deploy branch.
2. Check base directory.
3. Check build command.
4. Check publish directory.
5. Check environment variables:
   - `VITE_API_URL` must match the intended backend environment.
6. Trigger/retry deploy after correcting environment variables.

Expected Netlify build settings for the app subfolders usually look like:

```text
Build command: npm install && npm run build
Publish directory: build
```

## Chrome Verification Checklist

Use Chrome DevTools on each deployed app.

1. Open the app.
2. Open DevTools -> Network.
3. Log in.
4. Confirm requests go to the expected backend:
   - `/api/auth/login`
   - `/api/auth/me`
   - `/api/breeder/snapshot`
   - `/api/health`
5. In the breeder app, run Sync cloud database.
6. Confirm the request is not aborted by the browser and that the response is not a backend 500.
7. If sync fails, capture:
   - Request URL
   - HTTP status
   - Response body
   - Timing
   - Console error

Do not expose the backend URL in the normal app UI. It is acceptable to inspect it in DevTools.

## Android/APK Checklist

The APK uses build-time env files.

Current repo files:

```text
.env.android-staging
.env.android-production
```

Check:

1. Staging APK is built with `.env.android-staging`.
2. Production APK is built with `.env.android-production`.
3. Installed APK matches the environment being tested.
4. If `VITE_API_URL` changes, rebuild and reinstall the APK. Existing installed APKs will not update their backend URL automatically.

## Sync-Specific Notes

Backend fix already applied:
- Increased Prisma snapshot transaction timeout.
- Added unique refresh token IDs to prevent duplicate refresh token hashes.

Frontend fix already applied:
- Snapshot fetch timeout increased to 30 seconds.
- Snapshot save timeout increased to 90 seconds.

If sync still fails after deploy:

1. Verify the frontend is actually running commit `efc8d90` or newer.
2. Check Chrome Network for `/api/breeder/snapshot`.
3. If status is `500`, inspect backend logs for the actual exception.
4. If status is `401`, check auth/session cookie and token refresh behavior.
5. If the request reaches 90 seconds and aborts, the backend snapshot save is still too slow and needs server-side optimization or chunking.

## Acceptance Criteria

The issue is resolved when:

- Staging apps all use the staging backend and staging database.
- Production apps all use the production backend and production database.
- Chrome Network confirms requests are going to the intended backend.
- Admin login works in the intended environment.
- Breeder cloud sync succeeds without timeout or internal server error.
- The APK being tested is confirmed to match the intended environment.
- No backend URL is displayed in normal user-facing UI.
