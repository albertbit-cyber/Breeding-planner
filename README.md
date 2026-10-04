# Serpentora (Breeding Planner)

Serpentora is a platform for reptile breeders: a collection and breeding app with a genetics engine,
a genetic-testing laboratory portal, a marketplace, an admin console, and the shared backend they all
talk to.

The repository is a set of independent apps. Each `breeding-app-*` folder has its own `package.json`,
lockfile, tests and build, and is installed on its own. There is no workspace install at the root.

## The apps

| Folder | What it is | Dev server |
|---|---|---|
| `breeding-app-breeder` | The breeder app: animals, pairings, clutches, genetics, labels, lab orders. Also the Android app (Capacitor) and the desktop app (Electron, see below). | `http://localhost:5173` |
| `breeding-app-backend` | Express + Prisma + PostgreSQL API shared by every app: auth, sync, lab orders and results, marketplace, admin. | `http://localhost:4000` (`/api/health`) |
| `breeding-app-lab` | The laboratory portal: incoming orders, sample intake, result entry, certificates. Also an Android app (Capacitor). | `http://localhost:5174` |
| `breeding-app-marketplace` | The public marketplace for listings, stores and buyer messages. | `http://localhost:5173` |
| `breeding-app-admin` | The admin and moderation console. | `http://localhost:5173` |
| `breeding-app-public` | The marketing website. Its `PRODUCT.md` lists what the product may and may not claim. | `http://localhost:5174` |
| `breeding-app-shared` | Shared types, genetics, API contracts and helpers. Not yet a dependency of the breeder or lab apps, which still carry their own copies. | (library, no server) |

Several apps default to the same port, so run only one of each pair at a time or pass `-- --port <n>`.

## Requirements

- Node.js 22 or newer for the frontends; the backend requires Node 24 (`engines` in its `package.json`,
  and what CI and Railway run).
- PostgreSQL for the backend.

## Working on an app

Install and run each app from its own folder:

```bash
cd breeding-app-breeder      # or -lab, -marketplace, -admin, -public
npm install
npm run dev                  # dev server
npm test                     # Vitest unit tests (not in -public)
npm run lint                 # ESLint (not in -public)
npm run build                # production build into build/
```

The backend needs a database first:

```bash
cd breeding-app-backend
npm install
cp .env.example .env         # set DATABASE_URL and JWT_SECRET
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev                  # http://localhost:4000
npm test
npm run build
```

Frontends find the backend through `VITE_API_URL` (for example `http://127.0.0.1:4000/api`).

### End-to-end tests

The breeder and lab apps have Playwright suites that run against a freshly reset local database:

```bash
cd breeding-app-lab          # or breeding-app-breeder
npm run test:e2e:reset       # resets the local DB via the backend's e2e:reset:local, then runs Playwright
```

The reset refuses any database that is not on localhost. It wipes that database, so point
`DATABASE_URL` at a throwaway one (for example `breeding_planner_e2e`) rather than your working data.

## Deployment

All three deploy from `main`:

- **Breeder app**: Netlify, at serpentora.com (`breeding-app-breeder/netlify.toml`).
- **Backend**: Railway (`breeding-app-backend/railway.toml`). It runs `prisma migrate deploy` on start,
  and a failed migration fails the deploy.
- **Marketplace**: GitHub Pages, built by `.github/workflows/deploy.yml`.

`Dependency CI Foundation` (`.github/workflows/dependency-ci.yml`) runs the installs, lint, unit tests,
builds and both Playwright suites on every pull request and every push to `main`.

## What the root still holds

The root keeps only cross-app tooling:

| Script | What it does |
|---|---|
| `npm run i18n:verify:apps` | Checks every app's locale files for missing keys. `i18n:report:apps` also lists untranslated strings. |
| `npm run handoff:pdf` / `npm run manual:pdf` | Rebuild the PDFs in `docs/handoff/` and `docs/manuals/` from their Markdown. |
| `npm run test:e2e:live` | Windows only: runs the backend, lab and breeder E2E suites in sequence. It frees the ports it needs by stopping whatever is listening on them, and resets the local database. |
| `npm run dev:desktop` | The desktop app in development: starts the breeder dev server on 5173 and opens Electron on it. |
| `npm run dist:win` (`dist:mac`, `dist:linux`, `dist`) | Builds the breeder app, copies it to `build/`, and packages it with electron-builder into `dist/`. |

The desktop shell is `electron/`. It loads `build/index.html`, or `ELECTRON_START_URL` in development.
A desktop build needs `VITE_API_URL` set when building, or it runs in local-only mode.

`public/app-icons/` and `buildResources/` hold the desktop installer icons. The root `ios/`,
`shared/api.ts`, `e2e/fixtures/`, `index.html` and `craco.config.js` are left over from before the
split; no app or script uses them.

## Further reading

- `docs/handoff/`: engineering handoff. It predates the split, so read its `src/` and `server/` paths as
  `breeding-app-breeder/src/` and `breeding-app-backend/`.
- `docs/runbooks/`: operational runbooks (email delivery, admin and lab separation).
- `docs/architecture/`, `docs/audits/`, `docs/status/`: design notes, audits and status.
- `docs/manuals/`: the breeder user manual.
- Each app's own `README.md`.
