# Database Runtime Option Decision

Date: 2026-05-17

## Decision

Use a local PostgreSQL database on this machine for steps 76-90.

## Reason

Local PostgreSQL is the safest runtime target for this stage because the next steps require Prisma migrations, seed data, backend startup, and frontend E2E checks. A local database lets us validate the real backend path without any risk of touching production data.

## Decision Matrix

| Option | Status | Notes |
| --- | --- | --- |
| Local PostgreSQL | Approved | Recommended and selected for this stage. |
| Staging PostgreSQL | Not selected | Still acceptable later if explicitly approved. |
| Production PostgreSQL | Forbidden | Do not use production for migration, seed, or E2E checks. |

## Required Local Setup

- PostgreSQL installed and running locally.
- A dedicated local database for this app, for example `breeding_planner_local`.
- A dedicated local user/password or the local `postgres` user.
- `breeding-app-backend/.env` created manually from `breeding-app-backend/.env.example`.
- `DATABASE_URL` must point to `localhost`, `127.0.0.1`, or an explicitly approved local hostname.

## Expected Local Database URL Shape

Use this as a shape only. Replace the placeholders locally and do not commit the real value.

```text
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/breeding_planner_local?schema=public"
```

## Safety Rules

- Do not commit `.env`.
- Do not print database passwords, JWT secrets, or tokens.
- Do not run migrations unless the target is confirmed local.
- Do not deploy during these steps.
- Stop immediately if the database target looks like production or an unknown remote host.

## Next Commands After Safety Approval

Run only after `ENV_AND_DATABASE_SAFETY_VERIFICATION.md` confirms the local database target:

```powershell
cd breeding-app-backend
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
```

