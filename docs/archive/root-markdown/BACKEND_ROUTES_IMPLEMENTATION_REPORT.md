# Backend Routes Implementation Report

Generated for Step 25.

## Summary

No backend route code was changed in this pass.

Reason:

- The extracted backend already contains broad route groups for the four apps.
- Step 24 found the highest-risk remaining issue is frontend local SQLite lab-store usage, which needs careful feature-by-feature migration.
- The missing endpoint work was documented first in `MISSING_BACKEND_ENDPOINTS.md` and `API_ENDPOINTS_REFERENCE.md`.

## Existing Backend Coverage

Existing route groups cover:

- Auth.
- Breeder snapshot sync.
- Profiles.
- Listings.
- Inquiries.
- Searches.
- Notifications.
- Subscriptions.
- Marketplace.
- Mobile.
- Admin.
- Lab.
- Lab orders.

## Missing Or Needs Verification

- Granular breeder animals/pairings/clutches/egg boxes/hatchlings/spaces routes.
- Lab certificate and QR lookup exact contracts.
- Marketplace public unauthenticated listing routes if public browsing is required.
- Admin global settings and support diagnostics routes.
- Dedicated endpoint contracts for replacing frontend `src/db/labStore.ts` and local lab services.

## Next Implementation Recommendation

1. Finish backend role/auth normalization for `super_admin`, `admin`, `breeder`, `lab_owner`, `lab_staff`, `buyer`, and `viewer`.
2. Install backend dependencies and generate Prisma client in `breeding-app-backend`.
3. Verify existing route contracts with backend tests.
4. Migrate lab app local handlers to existing backend lab routes.
5. Add only the endpoints still missing after that mapping.

