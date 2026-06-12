# Environment Configuration Plan

Planning document for environment variables in the split repositories. No environment files should be changed as part of this step.

## Goal

Each frontend app gets its own public environment configuration, while all private secrets stay in `breeding-app-backend` deployment secrets. All frontend apps call the same shared backend API and never connect directly to PostgreSQL, Supabase, Prisma, or any service-role credential.

## Current Environment Signals

Current repo variables and files found during inspection:

- Root `.env.example` includes `VITE_API_URL`, `SEARCH_PROVIDER`, `BING_SEARCH_KEY`, `SERPAPI_KEY`, `SQLITE_PATH`, `CACHE_TTL_HOURS`, and `CACHE_ONLY`.
- Android examples exist as `.env.android-development`, `.env.android-staging`, and `.env.android-production`, each setting `VITE_API_URL`.
- Frontend API config is centralized in `src/shared/config/api.ts` and validates `VITE_API_URL`.
- Google Calendar sync references `VITE_GOOGLE_CLIENT_ID`.
- Vite build uses `PUBLIC_URL` and `ELECTRON_BUILD`.
- Electron uses `ELECTRON_START_URL`, `VITE_DEV_SERVER_URL`, and `NODE_ENV`.
- Local desktop/cache code references `LAB_DB_PATH` and `CACHE_DB_PATH`.
- Backend config in `server/src/config/env.ts` requires `DATABASE_URL` and `JWT_SECRET`, with optional `PORT`, `CORS_ORIGIN`, and `NODE_ENV`.

## Public Versus Secret Rules

Public frontend variables:

- May be included in browser bundles.
- Must use the `VITE_` prefix if consumed by Vite code.
- May include API base URLs, public OAuth client IDs, app names, deployment base paths, analytics public IDs, and feature-display flags.
- Must not include database credentials, JWT secrets, private API keys, service-role keys, webhook signing secrets, or payment/mail/storage secrets.

Secret backend variables:

- Exist only in backend deployment secrets, backend `.env`, or controlled CI secrets.
- Must never be copied into frontend `.env` files.
- Include `DATABASE_URL`, `JWT_SECRET`, Supabase service-role keys if ever used, payment provider secrets, mail provider secrets, storage secrets, private search keys, and webhook secrets.

## Frontend Environment Variables

### `breeding-app-breeder`

```env
VITE_API_URL=http://127.0.0.1:4000/api
VITE_APP_NAME=Breeding Planner
VITE_APP_SURFACE=breeder
VITE_GOOGLE_CLIENT_ID=
PUBLIC_URL=/
```

Notes:

- `VITE_GOOGLE_CLIENT_ID` is public and only enables Google Calendar browser OAuth.
- Electron/mobile builds may add shell-specific public values, but not backend secrets.
- Android development may use `VITE_API_URL=http://10.0.2.2:4000/api`.

### `breeding-app-admin`

```env
VITE_API_URL=http://127.0.0.1:4000/api
VITE_APP_NAME=Breeding Planner Admin
VITE_APP_SURFACE=admin
PUBLIC_URL=/
```

Notes:

- Admin role checks must happen on the backend. Frontend env must not contain privileged API keys.
- Production admin URL should be included in backend `CORS_ORIGIN`.

### `breeding-app-lab`

```env
VITE_API_URL=http://127.0.0.1:4000/api
VITE_APP_NAME=Breeding Planner Lab
VITE_APP_SURFACE=lab
PUBLIC_URL=/
```

Notes:

- Lab identity, lab account membership, and result permissions come from authenticated API responses, not env variables.
- Local fixture/demo toggles may be public only if they do not bypass backend authorization.

### `breeding-app-marketplace`

```env
VITE_API_URL=http://127.0.0.1:4000/api
VITE_APP_NAME=Breeding Planner Marketplace
VITE_APP_SURFACE=marketplace
PUBLIC_URL=/
```

Notes:

- Public marketplace pages may call unauthenticated public endpoints.
- Seller, buyer, inquiry, message, saved search, and notification actions must use authenticated API calls.

## Backend Environment Variables

Required:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/breeding_planner
JWT_SECRET=replace-with-long-random-secret
```

Recommended:

```env
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
```

Future backend-only secrets:

```env
JWT_REFRESH_SECRET=
COOKIE_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
PAYMENT_PROVIDER_SECRET=
PAYMENT_WEBHOOK_SECRET=
MAIL_PROVIDER_API_KEY=
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
SEARCH_PROVIDER=
BING_SEARCH_KEY=
SERPAPI_KEY=
RATE_LIMIT_REDIS_URL=
SENTRY_DSN=
```

Rules:

- `DATABASE_URL` belongs only to backend and controlled migration tooling.
- `JWT_SECRET` and refresh-token secrets belong only to backend.
- `CORS_ORIGIN` must be explicit in production.
- If Supabase is used as PostgreSQL hosting, frontend apps may have only public anon config if a separate Supabase client is truly required. The preferred split design is still frontend to backend only.
- Supabase service-role keys must never appear in frontend repos.

## Shared Package Environment

`breeding-app-shared` should not own runtime environment variables.

Allowed:

- Types and helpers for reading `VITE_API_URL`.
- Validation for public frontend config.
- Constants documenting app surfaces.

Not allowed:

- `.env` with secrets.
- `DATABASE_URL`.
- Prisma config.
- Deployment-specific credentials.

## API Base URL Rules

- Every frontend uses `VITE_API_URL`.
- The value must point to the shared backend `/api` base, such as `https://api.breedingplanner.dev/api`.
- Shared config may normalize a missing `/api` suffix in development, but production examples should include `/api`.
- Production builds must fail or show a clear configuration error if `VITE_API_URL` points to `localhost`, `127.0.0.1`, or `::1`.
- No frontend should hard-code a production API URL in source code.
- Backend should expose `/api/health` for environment and reachability checks.

## PostgreSQL And Supabase Rules

- The shared database is owned by `breeding-app-backend`.
- Frontend repos must not include Prisma, migrations, seed scripts, `DATABASE_URL`, database passwords, or Supabase service-role secrets.
- Migrations run from backend deployment, backend CI, or controlled admin tooling.
- If Supabase hosts PostgreSQL, use the pooled or direct PostgreSQL URL only in backend secrets.
- Public frontend Supabase anon keys should be avoided unless there is a separate non-database feature that requires them; database reads and writes still go through the backend.

## Local Development Example

Backend `.env`:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/breeding_planner_dev
JWT_SECRET=dev-only-change-me
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
```

Frontend `.env.local` for each app:

```env
VITE_API_URL=http://127.0.0.1:4000/api
PUBLIC_URL=/
```

Suggested local ports:

- Breeder: `http://localhost:5173`
- Admin: `http://localhost:5174`
- Lab: `http://localhost:5175`
- Marketplace: `http://localhost:5176`
- Backend: `http://127.0.0.1:4000/api`

Android emulator breeder build:

```env
VITE_API_URL=http://10.0.2.2:4000/api
```

## Production Deployment Example

Backend deployment secrets:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://prod-user:prod-password@prod-host:5432/breeding_planner
JWT_SECRET=<long-random-secret>
CORS_ORIGIN=https://app.breedingplanner.dev,https://admin.breedingplanner.dev,https://lab.breedingplanner.dev,https://marketplace.breedingplanner.dev
```

Frontend production variables:

```env
VITE_API_URL=https://api.breedingplanner.dev/api
PUBLIC_URL=/
```

Optional breeder-only public variable:

```env
VITE_GOOGLE_CLIENT_ID=<public-google-oauth-client-id>
```

Staging should use a separate API host and database:

```env
VITE_API_URL=https://staging-api.breedingplanner.dev/api
```

## Security Warnings

- Do not put `DATABASE_URL`, `JWT_SECRET`, Supabase service-role keys, private search keys, payment secrets, mail secrets, or storage secrets in any frontend app.
- Do not rely on frontend route guards for authorization. They are UX only.
- Do not allow production frontends to default to local backend URLs.
- Do not use wildcard `CORS_ORIGIN=*` in production.
- Do not commit real `.env` files.
- Rotate any secret that has ever been exposed in a frontend bundle or committed history.
- Keep public marketplace endpoints limited to public-safe fields.
- Keep admin, lab, subscription, and moderation checks enforced by backend roles and ownership rules.

## Per-Repo Env Example Files To Create Later

When the repos are split, create examples like:

```text
breeding-app-breeder/.env.example
breeding-app-admin/.env.example
breeding-app-lab/.env.example
breeding-app-marketplace/.env.example
breeding-app-backend/.env.example
```

Do not create these files in this step.
