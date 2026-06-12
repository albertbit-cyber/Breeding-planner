# Current Auth Runtime Audit

Step: 259

## Scope

Inspected the current authentication runtime across:

- Backend shared API
- Breeder frontend
- Lab frontend
- Admin frontend

This was an audit-only step. No app code, database state, credentials, deployment settings, or git remotes were changed.

## Source Context Read

- `CHATGPT_SECURITY_AND_MARKETPLACE_HANDOFF.md`
- `CHATGPT_DEPENDENCY_CI_HANDOFF.md`
- `CHATGPT_DETERMINISTIC_E2E_HANDOFF.md`
- Backend auth runtime files under `breeding-app-backend/src`
- Frontend shared auth/API clients under `breeding-app-breeder/src`, `breeding-app-lab/src`, and `breeding-app-admin/src`

## Backend Runtime

The backend currently uses Bearer JWT authentication.

Relevant files:

- `breeding-app-backend/src/middleware/auth.ts`
- `breeding-app-backend/src/middleware/roles.ts`
- `breeding-app-backend/src/services/authService.ts`
- `breeding-app-backend/src/controllers/authController.ts`
- `breeding-app-backend/src/routes/authRoutes.ts`
- `breeding-app-backend/src/utils/jwt.ts`
- `breeding-app-backend/src/auth/identity.ts`
- `breeding-app-backend/src/app.ts`

Current behavior:

- Access tokens are signed JWTs with a 15-minute expiry.
- Refresh tokens are signed JWTs with a 7-day expiry.
- Login returns both `token` and `refreshToken` in the JSON response body.
- Refresh expects `refreshToken` in the JSON request body and returns a rotated access token and refresh token.
- Refresh tokens are stored directly on the `User.refreshToken` column and compared directly on refresh.
- Password reset clears the stored refresh token.
- `requireAuth` reads only the `Authorization: Bearer ...` header.
- `requireAuth` does not currently read cookies.
- `requireRole` normalizes persisted roles before checking access.
- Persisted `lab` maps to `lab_staff`.
- Persisted `moderator` and `support` map to `admin`.
- Passing `admin` to `requireRole` expands to `super_admin` and `admin`.
- Passing `lab` to `requireRole` expands to `lab_owner` and `lab_staff`.
- Public registration is limited to `breeder` and `buyer`.
- Backend CORS enables credentials and allows all origins in non-production, but production requires configured `CORS_ORIGIN`.
- Helmet is enabled.
- JSON body size is limited to `1mb`.

Auth routes:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/recover-password`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

Notable current limiter:

- Login, registration, and password recovery have an `express-rate-limit` limiter in production.
- Refresh is not behind that same limiter.

## Backend Route Protection

Observed route protection patterns:

- `/api/admin/*` uses `requireAuth` plus `requireRole("admin")`.
- `/api/lab/orders/*` uses route-level auth and role checks for breeder, lab, and admin flows.
- `/api/breeder/snapshot` uses authenticated breeder/admin access.
- Marketplace/listing/profile/search/notification routes use route-level auth on private routes.
- Auth foundation routes exist for protected, admin-only, breeder-only, and identity checks.

Important distinction:

- Frontend role checks are only UI convenience gates.
- Backend route middleware and service ownership checks are the security boundary.

## Frontend Shared API Runtime

The Breeder, Lab, and Admin apps have very similar shared API clients.

Relevant files:

- `breeding-app-breeder/src/shared/apiClient.ts`
- `breeding-app-lab/src/shared/apiClient.ts`
- `breeding-app-admin/src/shared/apiClient.ts`
- `breeding-app-breeder/src/features/auth/AuthGate.jsx`
- `breeding-app-lab/src/features/auth/AuthGate.jsx`
- `breeding-app-admin/src/features/auth/AuthGate.jsx`

Current behavior:

- Access tokens are stored in `localStorage`.
- Refresh tokens are stored in `localStorage`.
- Storage is scoped by app surface:
  - `breedingPlannerBreederAuthToken`
  - `breedingPlannerLabAuthToken`
  - `breedingPlannerAdminAuthToken`
  - `breedingPlannerBreederRefreshToken`
  - `breedingPlannerLabRefreshToken`
  - `breedingPlannerAdminRefreshToken`
- Legacy breeder token keys are still read for backward compatibility.
- Auth session metadata is separately stored in `localStorage`:
  - `breedingPlannerBreederAuthSession`
  - `breedingPlannerLabAuthSession`
  - `breedingPlannerAdminAuthSession`
  - legacy `breedingPlannerAuthSession`
- API requests attach `Authorization: Bearer <token>` when auth is required and a token exists.
- On a 401, the client attempts one refresh retry if a refresh token exists.
- Refresh is done by posting `{ refreshToken }` to `/auth/refresh`.
- If refresh fails, stored auth for that scope is cleared.
- `getAuthScopeForHash` maps hash paths starting with `/admin` to admin auth scope, `/lab` to lab auth scope, and everything else to breeder.
- Public root/pricing surfaces are treated as unauthenticated public surfaces by AuthGate.

Security implication:

- The current browser-side token storage is vulnerable to token theft if any XSS is introduced.
- This is the main reason the next planned step, httpOnly-cookie migration, should be dual-mode and carefully staged.

## Breeder Runtime

The breeder app uses the shared auth client and AuthGate.

Runtime notes:

- AuthGate blocks protected hash routes unless the matching scoped auth session exists.
- Login stores tokens through the shared API client and stores session metadata through AuthGate.
- Registration creates only breeder/buyer accounts through the backend public registration flow.
- DEV builds show seeded local demo login hints in the UI.
- Breeder API calls use the shared `apiRequest`, so backend authorization remains the final enforcement point.

## Lab Runtime

The lab app uses the shared auth client and AuthGate, plus lab-specific role helpers.

Relevant files:

- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-lab/src/features/lab/auth/roleGuard.ts`

Runtime notes:

- The lab adapter reads `breedingPlannerLabAuthSession` for local role checks.
- Lab adapter methods call `requireSessionRole(...)` before invoking backend-backed handlers.
- These checks are local UI/runtime guards, not the final security boundary.
- Backend lab routes still enforce `requireAuth` and `requireRole`.
- `roleGuard.ts` currently reads only `breedingPlannerLabAuthSession`, so it can miss valid admin/breeder scoped sessions if used outside the lab-auth scope.

## Admin Runtime

The admin app uses the same AuthGate and shared API client, plus AdminApp local role gating.

Relevant files:

- `breeding-app-admin/src/features/auth/AuthGate.jsx`
- `breeding-app-admin/src/shared/apiClient.ts`
- `breeding-app-admin/src/admin/AdminApp.jsx`
- `breeding-app-admin/src/AppEntry.jsx`
- `breeding-app-admin/src/AuthShell.jsx`

Runtime notes:

- AdminApp reads `breedingPlannerAdminAuthSession` from `localStorage`.
- AdminApp denies panel access unless the stored session role is exactly `admin`.
- Backend `/api/admin/*` enforces admin access independently through `requireAuth` and `requireRole("admin")`.
- Admin UI role maps show `moderator` and `support` as admin-panel capable, but backend role normalization maps those roles to `admin` in tokens/middleware. AdminApp itself currently checks stored session role string for exactly `admin`, so moderator/support UI access may be inconsistent even if backend normalization would treat them as admin.

## Runtime Gaps

High priority:

- Browser tokens are stored in `localStorage`, not httpOnly cookies.
- Refresh tokens are persisted raw in the database user row.
- Refresh endpoint is not protected by the production auth limiter currently applied to login/register/recovery.
- No CSRF protection exists because auth is not cookie-based yet; this must be added during cookie migration.
- There is no centralized auth/session audit event stream for login, refresh, logout, failed login, refresh reuse, or password recovery.

Medium priority:

- Frontend local role guards duplicate backend authorization logic and can drift.
- Admin UI role gate currently checks only exact stored `admin`, while backend role normalization handles `moderator` and `support` as admin.
- Lab `roleGuard.ts` reads only the lab auth session key.
- AuthGate persists session profile metadata separately from the actual token state; it checks for any stored auth session, but role/profile metadata can still become stale until `/auth/me` or a protected request corrects it.
- Refresh retry logic is duplicated in each app copy of `shared/apiClient.ts`.

Lower priority:

- DEV login hints are correctly gated by `import.meta.env.DEV`, but should be checked again before production packaging.
- CORS is permissive in development by design; production config must remain strict.

## Recommended Next Step

Proceed to step 260: plan the httpOnly cookie migration.

The migration should be dual-mode first:

- Keep Bearer-token support temporarily for existing clients and deterministic E2E.
- Add secure httpOnly refresh cookie support on the backend.
- Add a CSRF strategy before browser writes depend on cookies.
- Add tests for Bearer and cookie modes.
- Avoid weakening deterministic E2E reset/login flows.
- Do not remove localStorage token support until all frontend apps and E2E tests have migrated.

## Verification

No tests or builds were run because this step made documentation-only changes.

