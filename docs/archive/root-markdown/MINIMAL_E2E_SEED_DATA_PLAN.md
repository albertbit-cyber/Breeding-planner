# Minimal E2E Seed Data Plan

Date: 2026-05-17

## Goal

Prepare only safe local test data needed for database-backed runtime checks.

## Existing Seed Script

The backend already includes:

```text
breeding-app-backend/prisma/seed.ts
```

The package script is:

```powershell
npm.cmd run prisma:seed
```

## Seed Data Needed

| Data | Needed For | Source |
| --- | --- | --- |
| Admin user | Admin/auth verification | Existing seed script |
| Lab user | Lab role/API verification | Existing seed script |
| Breeder user | Breeder login/catalog/pricing E2E | Existing seed script |
| Buyer user | Marketplace/admin sample data | Existing seed script |
| Shed test catalog | Lab catalog runtime E2E | Existing seed script |
| Active pricing config | Lab pricing runtime E2E | Existing seed script |
| Lab account | Lab runtime checks | Existing seed script |
| Marketplace/admin sample records | Non-blocking sample coverage | Existing seed script |

## Safety

- Local database only.
- No production data.
- No real customer data.
- No secrets printed in reports.

## Cleanup

For a full local reset:

1. Drop `breeding_planner_local`.
2. Recreate `breeding_planner_local`.
3. Run `npm.cmd run prisma:migrate:deploy`.
4. Run `npm.cmd run prisma:seed`.

