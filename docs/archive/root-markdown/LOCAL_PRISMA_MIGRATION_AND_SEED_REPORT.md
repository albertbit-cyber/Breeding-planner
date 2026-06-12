# Local Prisma Migration And Seed Report

Date: 2026-05-17
Scope: Step 62

## Result

Migration and seed were not run.

## Reason

No confirmed local or staging `DATABASE_URL` was found. The backend folder currently has `.env.example` only.

Running migrations without a confirmed target database would risk applying migrations to the wrong environment.

## Required Before Running

- Create `breeding-app-backend/.env`.
- Confirm `DATABASE_URL` points to local or staging only.
- Confirm the database is disposable or backed up.
- Confirm seed data is acceptable.

## Commands To Run After Confirmation

```powershell
npm.cmd --prefix breeding-app-backend run prisma:generate
npm.cmd --prefix breeding-app-backend run prisma:migrate:deploy
npm.cmd --prefix breeding-app-backend run prisma:seed
```

