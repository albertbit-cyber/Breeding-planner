# Engineering Handoff

This handoff documents the repository as it exists on 2026-04-25. It is an audit of the current codebase, not a rewrite of product intent. Where older docs disagree with the code, treat the code as authoritative.

## Executive Summary

Breeding Planner is a hybrid codebase with two distinct architectural centers:

- A large, local-first breeder application centered on [`src/App.jsx`](../../src/App.jsx)
- A newer, more modular lab and shared-backend system centered on [`src/features/lab`](../../src/features/lab), [`src/shared`](../../src/shared), and [`server/src`](../../server/src)

The project currently ships in four runtime shapes:

- Browser app via Vite
- Electron desktop app
- Capacitor mobile wrappers for Android and iOS
- Express + Prisma shared backend for auth, lab catalog, pricing, orders, and result workflows

The most important transition fact is that the repository is mid-migration. Core breeder planning is still mostly local-state driven. Shared lab/auth flows are backend-driven. The result is a real hybrid system, not a cleanly unified architecture.

## Start Here

For a new developer, this is the shortest reliable path into the codebase:

1. Read [architecture.md](./architecture.md)
2. Read [product-spec.md](./product-spec.md)
3. Read [backend-api-and-data.md](./backend-api-and-data.md)
4. Read [testing-and-quality.md](./testing-and-quality.md)
5. Read [decisions-and-risks.md](./decisions-and-risks.md)

## Quick Local Setup

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
cd server
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Default local URLs:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:4000`
- Backend health: `http://127.0.0.1:4000/api/health`

Frontend shared-backend configuration is controlled by `VITE_API_URL`.

## Authoritative Code Paths

These files matter most when reading the system:

- [`src/index.jsx`](../../src/index.jsx): frontend entry point
- [`src/AuthShell.jsx`](../../src/AuthShell.jsx): top-level shell, auth gate, appearance, and hash-based surface switching
- [`src/App.jsx`](../../src/App.jsx): main breeder app, very large and state-heavy
- [`src/features/lab/LabAppShell.jsx`](../../src/features/lab/LabAppShell.jsx): lab portal shell and routing
- [`src/features/lab/api/client.ts`](../../src/features/lab/api/client.ts): compatibility layer between local handlers and shared backend
- [`src/shared/apiClient.ts`](../../src/shared/apiClient.ts): backend auth/session client
- [`server/src/app.ts`](../../server/src/app.ts): backend app composition
- [`server/prisma/schema.prisma`](../../server/prisma/schema.prisma): shared backend data model
- [`server/prisma/seed.ts`](../../server/prisma/seed.ts): seed users, catalog, pricing

## Important Non-Authoritative or Legacy Areas

These exist in the repository but should not be treated as the primary implementation without confirming usage first:

- [`src/App.js`](../../src/App.js)
- [`src/App_prev.jsx`](../../src/App_prev.jsx)
- [`src/HEAD_App.jsx`](../../src/HEAD_App.jsx)
- [`src/main_App.jsx`](../../src/main_App.jsx)
- [`packages/core`](../../packages/core)
- [`apps/desktop`](../../apps/desktop)

They may contain useful history, but the active browser app currently routes through `App.jsx`, not those files.

## Current Transition Risks

The main transition risks are:

- One very large monolithic breeder component (`App.jsx`)
- Mixed JavaScript and TypeScript with incomplete type coverage
- Multiple persistence modes in the same product
- Partial feature parity between local lab handlers and shared backend APIs
- Stale docs and old environment variable names still present in the repo
- No browser E2E coverage and no CI workflow that enforces test execution

These are expanded in [decisions-and-risks.md](./decisions-and-risks.md).

## Recommended First-Week Plan For A New Developer

1. Stand up both frontend and backend locally.
2. Confirm login, breeder view, lab portal, catalog edit, order creation, result submission, and certificate generation manually.
3. Trace data flow through `AuthShell.jsx`, `App.jsx`, `LabAppShell.jsx`, and `src/features/lab/api/client.ts`.
4. Read the backend Prisma schema and services before changing shared lab behavior.
5. Avoid broad refactors until the persistence split and active code paths are fully understood.
