# Testing And Deployment Plan

Generated for Step 15.

## Scope

This plan covers the split platform:

- `breeding-app-breeder`
- `breeding-app-admin`
- `breeding-app-lab`
- `breeding-app-marketplace`
- `breeding-app-backend`
- `breeding-app-shared`
- one shared PostgreSQL database

No deployment was performed.

## Local Testing Checklist

1. Install dependencies in every repo.
2. Create `.env` files from each `.env.example`.
3. Start PostgreSQL or configure hosted PostgreSQL.
4. Run backend Prisma generation.
5. Run backend migrations.
6. Start `breeding-app-backend`.
7. Start each frontend on a separate port.
8. Confirm every frontend points to the same `VITE_API_URL`.
9. Confirm backend health endpoints work.
10. Confirm frontend backend-status banners report connected state.

Suggested local ports:

| App | Port |
| --- | --- |
| Backend | `4000` |
| Breeder | `5173` |
| Admin | `5174` |
| Lab | `5175` |
| Marketplace | `5176` |

## Build Testing Checklist

Run:

```bash
npm run build
npm test
```

For backend also run:

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm test
```

For shared package:

```bash
npm run build
npm test
```

Required before release:

- All frontend builds pass.
- Backend build passes after dependency install and Prisma generation.
- Shared package build passes.
- Tests pass or failing suites are explicitly moved to the correct repo.

## Authentication Tests

- Register breeder user.
- Register buyer user.
- Create/admin-seed admin user.
- Create lab owner and lab staff users.
- Login from every app.
- Refresh token after page reload.
- Expired token redirects or asks for login.
- Logout clears the correct app token scope.
- A user logged into one app cannot silently gain unauthorized access to another app.
- Password recovery flow validates email and full name.

## Role Permission Tests

| Role | Must access | Must be blocked from |
| --- | --- | --- |
| `super_admin` | all admin/backend controls | none, except destructive operations requiring confirmation |
| `admin` | admin app, moderation, users, subscriptions | direct DB access |
| `breeder` | breeder app, own animals, own pairings, own clutches, own listings | admin tools, other breeders' private records, lab-only data |
| `lab_owner` | lab app, own lab settings, lab staff management | unrelated labs, admin-only controls |
| `lab_staff` | lab order workflows assigned/allowed by lab | admin tools, other labs, breeder private records |
| `buyer` | marketplace browsing, inquiries, own messages/favorites | breeder private records, lab app, admin app |
| `viewer` | read-only assigned views | writes and admin/lab/private data |

## Breeder Workflow Tests

- Add animal manually.
- Add animal with free text, including `het`, `50% het`, and `66% het`.
- Upload animal image and verify image fits frame.
- Edit animal in floating card.
- Delete confirmation opens as floating confirmation.
- Create pairing.
- Add clutch with laid date.
- Verify clutch and egg box numbering by laid date.
- Split egg boxes above 10 eggs.
- Update bad eggs and verify egg count changes.
- Hatch clutch and add hatchlings in floating window.
- Print clutch card.
- Export QR label and scan/import QR.
- Create marketplace listing from owned animal.
- Order genetic test from breeder app.
- Save and reload with shared backend snapshot.

## Admin Workflow Tests

- Login as admin.
- View admin dashboard.
- Search/filter users.
- Change user role/status with audit reason.
- Review breeder verification.
- View and moderate reports.
- Moderate marketplace listing.
- View subscription tiers.
- Create/edit/archive tier.
- Add user subscription override.
- View audit logs.
- Confirm non-admin roles are blocked from admin routes and APIs.

## Lab Workflow Tests

- Login as lab user.
- View lab dashboard.
- View incoming orders.
- Open order detail.
- Generate/scan QR label.
- Mark sample received.
- Approve/reject intake.
- Move test to in process.
- Save result draft.
- Submit result.
- Finalize genetics update.
- Generate certificate.
- View completed tests.
- Manage catalog/pricing if role allows.
- Confirm breeder and buyer roles are blocked from lab-only routes.

## Marketplace Workflow Tests

- Browse listings.
- Search/filter listings.
- Open listing detail.
- View breeder/store profile.
- Save search.
- Favorite listing.
- Send inquiry.
- Continue buyer/seller conversation.
- Seller creates listing.
- Seller edits listing.
- Seller changes listing status.
- Confirm private breeder data does not appear publicly.
- Confirm admin-only moderation data does not appear in marketplace app.

## Database Tests

- Migrations run from clean database.
- Seed creates required roles/catalogs/features.
- User, profile, animal, pairing, clutch, lab order, listing, message, subscription, and audit records are linked correctly.
- Owner checks prevent cross-user reads and writes.
- Foreign keys and cascade rules behave as expected.
- Backup and restore procedure is tested.
- Large breeder snapshot and marketplace list queries paginate or stay performant.

## API Tests

- `/health` and `/api/health`.
- Auth register/login/refresh/current user.
- Breeder snapshot fetch/save.
- Profile fetch/update.
- Lab catalog/pricing/order/result/certificate routes.
- Marketplace listing/inquiry/message/favorite/saved-search routes.
- Subscription public tiers and access check routes.
- Admin dashboard/user/report/verification/subscription/audit routes.
- Mobile sync/scan routes if mobile remains active.
- Unauthorized request returns `401`.
- Forbidden role returns `403`.
- Validation errors return consistent `400`/`422`.

## Deployment Steps

1. Create GitHub repositories for all six projects.
2. Commit the prepared split folders into their target repos.
3. Configure secrets in backend hosting.
4. Configure public frontend env vars in frontend hosting.
5. Deploy backend first.
6. Run backend migrations against production database.
7. Confirm `/api/health`.
8. Deploy shared package or publish private package.
9. Install shared package in frontend/backend repos.
10. Deploy breeder app.
11. Deploy admin app.
12. Deploy lab app.
13. Deploy marketplace app.
14. Run smoke tests against production URLs.
15. Enable monitoring/logging alerts.

## Rollback Plan

- Keep `backup-before-repo-split` branch unchanged until split production is verified.
- Keep the original combined app deployable.
- Before production migration, take a database backup.
- If backend deployment fails, roll back backend image/build and do not deploy frontends.
- If a frontend fails, roll back only that frontend to the previous build.
- If migration fails, restore database backup or apply forward fix migration depending on severity.
- Keep DNS changes reversible until all apps pass smoke tests.

## GitHub Repository Checklist

For each repo:

- `README.md`
- `.env.example`
- `.gitignore`
- `package.json`
- lockfile chosen and committed
- CI workflow for install/build/test
- branch protection
- required checks
- deployment secrets
- Dependabot or dependency update policy
- issue labels
- release tags
- ownership notes

Backend-specific:

- database migration workflow
- Prisma generate step
- production secrets
- CORS allowed origins
- API health check

Frontend-specific:

- `VITE_API_URL`
- build output configuration
- app-specific deployment target
- smoke test route

Shared package-specific:

- package publish workflow or workspace linking policy
- versioning policy
- changelog
- compatibility matrix for consuming apps

