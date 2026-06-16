# Breeding Planner

Breeding Planner is a full-stack application for reptile breeders. It features a genetics engine with Punnett square calculations, heat rack / terrarium space management, a laboratory testing module, QR code workflows, PDF label generation, and support for 10 languages. It runs in the browser, as an Electron desktop app, and as a Capacitor mobile app (iOS / Android).

## Engineering Handoff

For a codebase audit and transition package intended for a new developer, start with [docs/handoff/README.md](./docs/handoff/README.md).

## User Manual

For the breeder-facing application manual, start with [docs/manuals/Breeding-Planner-User-Manual.md](./docs/manuals/Breeding-Planner-User-Manual.md).

## Architecture

```
/src          React frontend (Vite, mixed JS/TS)
/src/shared   Shared backend client/session logic
/server       Express + Prisma backend (PostgreSQL)
/electron     Electron shell for desktop
/android      Capacitor Android project
/ios          Capacitor iOS project
```

The frontend can run fully offline (local state) or connect to the shared backend for multi-device sync. The backend is optional - the app degrades gracefully when offline.

## Role System

| Role | Access |
|---|---|
| `breeder` | Submit lab orders, view own results |
| `lab` | View all orders, enter test results, update status |
| `admin` | Full access including pricing, catalog, bulk operations |

## Prerequisites

- [Node.js 20+](https://nodejs.org/) (ships with npm)
- macOS, Linux, or Windows. Cross-building the Windows installer on macOS/Linux additionally requires [Wine](https://www.winehq.org/).

Install frontend dependencies:

```bash
npm install
```

Install server dependencies:

```bash
cd server && npm install
```

## Web Development Workflow

- `npm run dev` - start Vite at `http://localhost:5173`
- `npm run build` - produce a production build in `build/`
- `npm run preview` - preview the last build
- `npm test` - run frontend unit tests (Vitest)

## Desktop Workflow (Electron)

- `npm run electron-dev` - runs Vite and launches Electron pointing at the dev server
- `npm run dist:win` - builds the renderer and produces a Windows NSIS installer in `dist/`
- `npm run dist:mac` / `npm run dist:linux` - platform-specific installers; `npm run dist` builds all targets supported on the host OS

> **Code splitting:** The web build uses Vite code splitting by default. To produce a single bundle for Electron, set `ELECTRON_BUILD=true` before building.

### Making A Windows Installer

1. Ensure dependencies are installed (`npm install`) and, if you are not on Windows, install Wine so Electron Builder can create `.exe` files.
2. Run:
   ```bash
   npm run dist:win
   ```
3. When the command finishes you will find `Breeding Planner Setup.exe` inside the `dist/` directory along with the unpacked app.

The installer bundles the production build generated under `build/` together with `electron/main.js`. Update `public/app-icons` before building if you need a different icon.

## Shared Backend (Optional)

The backend enables multi-device sync and the full lab management system.

### Environment Variables (`server/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `CORS_ORIGIN` | No | Comma-separated allowed origins (production) |
| `PORT` | No | Server port (default: 4000) |
| `NODE_ENV` | No | `development` or `production` |

### Server Setup

```bash
cd server
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

### Running Server Tests

```bash
cd server && npm test
```

### Deploying

Deploy the `/server` directory to any Node.js host (Railway, Render, Fly.io, VPS). Set the environment variables, run `prisma:migrate` and `prisma:seed` once, then start with `npm start`. Point the frontend at the deployed URL via `VITE_API_URL`.
