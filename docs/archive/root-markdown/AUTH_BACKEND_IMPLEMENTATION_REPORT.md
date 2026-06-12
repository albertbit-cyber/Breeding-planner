# Auth Backend Implementation Report

## Scope

Implemented Step 19 in `breeding-app-backend` only. The existing JWT auth middleware and role guard were kept, then extended with target role normalization and foundation routes.

## Changed Files

- `breeding-app-backend/src/types/auth.ts`
- `breeding-app-backend/src/auth/identity.ts`
- `breeding-app-backend/src/middleware/auth.ts`
- `breeding-app-backend/src/middleware/roles.ts`
- `breeding-app-backend/src/services/authService.ts`
- `breeding-app-backend/src/routes/authFoundationRoutes.ts`
- `breeding-app-backend/src/app.ts`

## Auth And Roles

- Added target roles: `super_admin`, `admin`, `breeder`, `lab_owner`, `lab_staff`, `buyer`, and `viewer`.
- Preserved legacy persisted roles: `lab`, `moderator`, and `support`.
- Normalized legacy `lab` to `lab_staff` for request identity.
- Normalized legacy `moderator` and `support` to coarse `admin` identity for compatibility until narrower policies are added.
- Added protected, admin-only, breeder-only, and identity-check foundation endpoints.

## Remaining Security Work

- Prisma `UserRole` still uses the older persisted enum and needs a later non-destructive migration plan before storing `super_admin`, `lab_owner`, `lab_staff`, or `viewer`.
- Route guards are coarse. Domain services still need ownership, participant, lab-account, subscription, and audit policies before broad production exposure.
