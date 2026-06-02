# Monorepo Migration Plan

## Current State

The repository is still a single Vite/Electron frontend with a separate Express backend in `server/`.

Existing structure:

- `src/` contains the main breeder app, shared frontend shell, calendar, breeding planner, lab entry points, i18n, and many local app services.
- `server/` contains the Express/Prisma backend for auth, lab catalog/pricing, shed-test orders, and order results.
- `apps/desktop/` exists as a placeholder for desktop packaging.
- `packages/core/` exists with generated/build output and a small source folder, but it is not yet the source of truth for shared app logic.
- `shared/` and `src/shared/` both exist, so shared contracts need consolidation before files are moved.

## Target Shape

Long term target:

```txt
/apps
  /breeder-app
  /marketplace-web
  /lab-app
  /admin-app

/backend

/packages
  /ui
  /types
  /shared
  /api-client
  /genetics
```

## Migration Rules

1. Keep the current app running while extracting code.
2. Move one ownership area at a time.
3. Add tests around behavior before moving shared logic.
4. Do not move `src/App.jsx` wholesale. Extract stable modules from it in small slices.
5. Keep `server/` as the backend until a deliberate `backend/` rename is planned and tested.
6. Treat `VITE_API_URL=http://127.0.0.1:4000/api` as the local frontend-to-backend default unless the server port changes.

## Recommended Order

1. Create `packages/types` for shared DTOs used by frontend and backend.
2. Move lab order/result shared types from `src/types` and `shared/api.ts` into `packages/types`.
3. Create `packages/api-client` from `src/shared/apiClient.ts` after the type move.
4. Create `packages/genetics` from stable genetics, goal, and scoring modules after test coverage is green.
5. Extract the breeder app shell from `src/App.jsx` into `apps/breeder-app` only after its data and routing boundaries are clear.
6. Split lab/admin/marketplace app entry points after shared auth and API client packages are stable.
7. Rename or mirror `server/` to `backend/` only after CI/build scripts use the new path.

## Stage 1 Completion Criteria

- A checkpoint commit exists before structural changes.
- Environment examples document the local backend URL.
- The target structure is documented.
- The repo avoids large file moves until current tests/builds pass after each extraction.
