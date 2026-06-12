# Auth And Permission Audit

Step: 244

## Current Auth Model

- Backend auth uses Bearer tokens from the `Authorization` header in `breeding-app-backend/src/middleware/auth.ts`.
- Access tokens are JWTs with a 15 minute expiry.
- Refresh tokens are JWTs with a 7 day expiry and are stored on the `User.refreshToken` column.
- Refresh rotates the stored refresh token.
- Password recovery clears the stored refresh token.
- Public registration is limited to breeder and buyer roles by validator/controller behavior.

## Current Permission Model

- Route-level checks use `requireAuth` and `requireRole`.
- Role normalization maps persisted `lab` to `lab_staff`, and `admin` to admin/super-admin behavior.
- Lab orders enforce breeder visibility in `orderService`.
- Marketplace ownership checks are mostly service-level:
  - sellers can edit only their listings;
  - conversation access requires buyer, seller, or admin;
  - sale management requires seller or admin;
  - seller dashboard is restricted to breeder/admin roles.

## Findings

- Auth is not yet httpOnly-cookie based; browser apps store tokens client-side.
- There is no CSRF protection layer yet.
- DTO shaping exists in individual service normalizers, but it is not centralized.
- Marketplace public browse routes still require auth, so "public exposure" is currently authenticated-public rather than anonymous-public.
- Marketplace listing DTOs include seller IDs and public store/profile details, but do not expose password hashes or refresh tokens.
- Admin audit tables exist, but audit coverage is partial and not centralized for all sensitive actions.

## Risk Rating

Medium before public launch. Current role/ownership controls are reasonable for local authenticated use, but public marketplace, cookie auth, uploads, messaging abuse controls, and centralized DTO safety need dedicated hardening.
