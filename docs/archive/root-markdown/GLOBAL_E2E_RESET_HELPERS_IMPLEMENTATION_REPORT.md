# Global E2E Reset Helpers Implementation Report

Step: 214

## Implemented

- Added `breeding-app-backend/prisma/e2eReset.ts`.
- Added backend scripts:
  - `e2e:reset`
  - `e2e:reset:local`
- Added reset-aware frontend scripts:
  - `breeding-app-lab`: `test:e2e:reset`
  - `breeding-app-breeder`: `test:e2e:reset`

## Safety Behavior

- The reset refuses to run unless `E2E_RESET_CONFIRM=local`.
- The reset parses `DATABASE_URL` and rejects non-local or production-like URLs.
- The reset does not print passwords, tokens, or the raw database URL.

## Verification

- `npm.cmd run e2e:reset:local` passed against local database `breeding_planner_local`.
