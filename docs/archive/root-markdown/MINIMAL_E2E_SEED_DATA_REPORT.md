# Minimal E2E Seed Data Report

Date: 2026-05-17

## Result

Passed.

The existing backend seed script ran successfully against the approved local PostgreSQL database.

## Command Run

```powershell
npm.cmd run prisma:seed
```

## Seed Output Summary

The script reported:

```text
Seed complete: admin/lab/breeder/buyer users + catalog + pricing + admin advanced tool samples created.
```

## Seeded Runtime Coverage

| Area | Status |
| --- | --- |
| Login users | Seeded |
| Lab catalog | Seeded |
| Lab pricing | Seeded |
| Lab account | Seeded |
| Admin sample data | Seeded |
| Marketplace sample data | Seeded |

## Notes

- Secret values were not printed.
- The seed script uses local development credentials for test users only.
- Prisma warns that `package.json#prisma` seed configuration is deprecated for Prisma 7; this does not block the current local runtime stage.

