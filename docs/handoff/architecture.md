# Architecture And Stack

## Stack Summary

Frontend:

- React 18
- Vite 5
- JavaScript + TypeScript mix
- Vitest
- Tailwind CSS 4
- i18next
- jsPDF / PDF tooling
- better-sqlite3 for local lab persistence in Node/Electron contexts

Desktop and mobile packaging:

- Electron 30
- Capacitor for Android and iOS wrappers

Backend:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Zod
- JWT auth with refresh tokens

Supporting libraries used by product features include `html5-qrcode`, `xlsx`, and `reactflow`.

## Runtime Surfaces

| Surface | Entry point | Purpose | Notes |
|---|---|---|---|
| Web app | [`src/index.jsx`](../../src/index.jsx) | Main browser runtime | Vite dev/build target |
| Desktop app | [`electron/main.js`](../../electron/main.js) | Electron shell around the web UI | Thin shell with IPC persistence bridge |
| Mobile wrappers | [`capacitor.config.ts`](../../capacitor.config.ts) | Android/iOS packaging | Uses production web build |
| Shared backend | [`server/src/server.ts`](../../server/src/server.ts) | Auth, catalog, pricing, orders, results | Postgres + Prisma |

## Repo Map

| Path | Purpose | Status |
|---|---|---|
| [`src`](../../src) | Frontend application code | Active |
| [`server`](../../server) | Shared backend | Active |
| [`electron`](../../electron) | Desktop shell | Active |
| [`android`](../../android) / [`ios`](../../ios) | Capacitor platform projects | Present |
| [`public`](../../public) | Static assets | Active |
| [`tests`](../../tests) | Domain-level tests | Active |
| [`packages/core`](../../packages/core) | Legacy/shared package experiment | Likely stale |
| [`apps/desktop`](../../apps/desktop) | Secondary app scaffolding | Likely stale |

## Frontend Composition

Top-level flow:

1. `src/index.jsx` renders `AuthShell`
2. `AuthShell.jsx` applies appearance and shared-backend providers
3. `AuthShell.jsx` switches surfaces using `window.location.hash`
4. The hash determines whether the user sees:
   - the breeder app via `App.jsx`
   - the lab app via `src/features/lab/LabAppShell.jsx`

This project does not currently use React Router. Routing is custom and hash-based.

## Main Architectural Split

### 1. Breeder Core

The breeder surface is still dominated by [`src/App.jsx`](../../src/App.jsx), which contains a large amount of application state and behavior in one file. It covers:

- snake records
- pairings and planner flows
- genetics views and helpers
- rack/space management
- QR and label workflows
- backup/export/import behavior
- breeder-side lab integrations

This is the largest technical concentration point in the repository.

### 2. Lab And Shared Backend

The lab surface is relatively more modular:

- UI and routes in [`src/features/lab`](../../src/features/lab)
- service logic in [`src/services/lab`](../../src/services/lab)
- backend access in [`src/features/lab/api/client.ts`](../../src/features/lab/api/client.ts)
- auth/session logic in [`src/shared`](../../src/shared)
- backend domain logic in [`server/src/services`](../../server/src/services)

This area is where most recent architectural investment has gone.

## Persistence Modes

One of the most important things to understand in this codebase is that data does not live in one place.

| Data area | Primary storage | Notes |
|---|---|---|
| Core breeder planner data | Browser `localStorage` | Used heavily by `App.jsx` |
| Desktop local persistence | Electron IPC to local app data | Supplements browser storage in Electron mode |
| Local lab store | `better-sqlite3` or in-memory/browser fallback | Managed by [`src/db/labStore.ts`](../../src/db/labStore.ts) |
| Shared lab/auth/order data | PostgreSQL through Express/Prisma backend | Required for multi-device workflows |
| UI/backend status flags | `localStorage` | Shared-backend session and status are cached locally |

This means the app is not simply "offline" or "online". It is hybrid.

## Shared Backend Model

Shared backend features currently include:

- authentication
- role-based access (`breeder`, `lab`, `admin`)
- test catalog
- pricing configuration
- shed-test order creation
- order status transitions
- result draft/submit flow
- certificate issuance support

The frontend is designed to work against either local handlers or the backend for some lab features. That bridge lives in [`src/features/lab/api/client.ts`](../../src/features/lab/api/client.ts).

## Known Structural Constraints

### Monolith In `App.jsx`

`App.jsx` is the dominant complexity hotspot. It is large, state-heavy, and not fully covered by TypeScript because the root `tsconfig.json` does not typecheck `.jsx` files.

### Mixed Language Boundaries

The repository uses:

- `.jsx` and `.js` in large frontend areas
- `.ts` and `.tsx` in newer frontend modules
- strict TypeScript on the backend

This means safety and maintainability vary by subsystem.

### Dual Code Paths

Lab functionality is split across:

- local service handlers
- shared backend API paths

Feature parity is not complete. Some operations explicitly remain unavailable on the shared backend path.

## Active Versus Legacy Files

Active primary files:

- `src/App.jsx`
- `src/AuthShell.jsx`
- `src/features/lab/LabAppShell.jsx`
- `src/shared/apiClient.ts`
- `server/src/**/*`

Files that appear to be historical or secondary:

- `src/App.js`
- `src/App_prev.jsx`
- `src/HEAD_App.jsx`
- `src/main_App.jsx`

These should be treated as context, not source of truth.

## Architecture Recommendations For Transition

Short-term:

- keep changes localized to the active code paths
- document whether a change is local-only, backend-only, or both
- test both breeder and lab surfaces when touching shared flows

Medium-term:

- reduce `App.jsx` by extracting clear domain modules
- converge local/shared data paths where possible
- add explicit routing and feature ownership boundaries
- increase TypeScript coverage on the active frontend surface
