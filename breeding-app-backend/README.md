# breeding-app-backend

Prepared shared backend/API split from the combined Breeding Planner repository.

## Contains

- Express backend source in `src/`.
- Prisma schema, migrations, and seed in `prisma/`.
- Backend package metadata copied from `server/`.
- Health checks at `/health`, `/api/health`, and `/api/system/health`.
- Local-only database check at `/api/system/db-check`.
- Auth foundation probes at `/api/auth/foundation/protected`, `/admin-only`, `/breeder-only`, and `/identity`.

## Environment

Create `.env` from `.env.example` and provide:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN` for browser app domains. If this is empty in production, the backend still starts for health checks, but browser requests will not receive CORS headers.
- `PORT`

## Commands

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
npm run build
npm run start:migrate
npm start
npm test
```

## Known Cleanup

- Update imports to consume safe pure contracts from `breeding-app-shared`.
- Keep Prisma and secrets backend-only.
- Add deployment-specific CORS origins for the final frontend domains.
- Replace coarse route guards with domain ownership checks before exposing expanded multi-app APIs.
