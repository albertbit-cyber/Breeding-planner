# Pre Staging Quality Gate Report

## Passed
- `npm.cmd run prisma:generate`
- `npm.cmd test -- auth.test.ts refreshTokenSessionService.test.ts securityEventService.test.ts uploadValidationService.test.ts marketplaceDto.test.ts permissionHelpers.test.ts listingService.test.ts`
- `npm.cmd test` in `breeding-app-backend`: 17 files, 85 tests.
- `npm.cmd run build` in `breeding-app-backend`
- `npm.cmd run prisma:migrate:deploy` against local PostgreSQL
- `npm.cmd run e2e:reset:local`

## Partial / Not Clean
- `npm.cmd run test:e2e:live:no-reset` timed out after 10 minutes.
- Lab E2E partially ran; several specs were marked failing/retrying.
- Breeder E2E did not start before timeout.

## Staging Gate Status
Not ready for staging until live browser E2E is clean or failures are triaged and accepted.

