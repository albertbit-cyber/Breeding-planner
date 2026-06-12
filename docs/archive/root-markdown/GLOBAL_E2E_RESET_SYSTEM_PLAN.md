# Global E2E Reset System Plan

Step: 213

## Plan

Create one backend-owned reset command because the backend owns Prisma and the shared database.

## Reset Contract

- Command: `npm.cmd run e2e:reset:local` from `breeding-app-backend`.
- Safety: require `E2E_RESET_CONFIRM=local`.
- Database: allow only local PostgreSQL hostnames: `localhost`, `127.0.0.1`, `::1`.
- Refuse production-like URL fragments including production, staging, Render, Railway, Supabase, Neon, AWS/RDS, Heroku, Fly, and Vercel.
- Data scope: reset seeded breeder lab-order data, not arbitrary user records.

## Fixture Contract

- Stable breeder: `breeder@proherper.dev`.
- Stable lab: `lab@proherper.dev`.
- Stable baseline order: `05AA00001`.
- Stable animal: `25Ath-1` / `Athena - DEMO`.
- Stable test: `clown`.
