# Breeding Planner – AI Guide

## Architecture Snapshot
- React 18 + Vite entry flows from [src/index.jsx](src/index.jsx) → [src/AuthShell.jsx](src/AuthShell.jsx) where `AppearanceProvider` wraps the giant UI in [src/App.jsx](src/App.jsx); most UI is monolithic so touch components surgically and keep hooks pure.
- Electron shell in [electron/main.js](electron/main.js) loads the Vite build or dev server, persists JSON via `app:load-data`/`app:save-data`, and runs a preload bridge in [electron/preload.js](electron/preload.js); never bypass these IPC channels when adding desktop-only storage.
- Suggestion logic is centralized in [src/features/suggestions/api.ts](src/features/suggestions/api.ts) and rendered in [src/features/suggestions/SuggestionsTab.tsx](src/features/suggestions/SuggestionsTab.tsx); keep new pairing features inside this module so scoring, demand extraction, and planning stay consistent.

## Domain Modules & Patterns
- Genetics: [src/genetics/punnett.ts](src/genetics/punnett.ts) + [src/genetics/geneLibrary.ts](src/genetics/geneLibrary.ts) provide all allele math and gene metadata; extend them instead of duplicating ratios elsewhere.
- Ranking: risk rules come from [src/config/rules.json](src/config/rules.json) and are applied in [src/rank/rules.ts](src/rank/rules.ts), while [src/rank/score.ts](src/rank/score.ts) combines demand, novelty, and risks—respect the weight structure when adding new factors.
- Goals: [src/goals/goal.ts](src/goals/goal.ts) defines matching/prefilter helpers and is shared by planner UI plus vitest suites; any new goal behavior needs matching tests in [tests/goals.test.ts](tests/goals.test.ts).
- Demand & signals: [src/signals/extract.ts](src/signals/extract.ts) fetches HTML, parses with JSDOM/Readability, and caches via [src/db/cache.ts](src/db/cache.ts); browser builds fall back to in-memory caches while Node/Electron uses `better-sqlite3`.
- External research: [src/signals/search.ts](src/signals/search.ts) hits Bing or SerpAPI (env keys `BING_SEARCH_KEY`/`SERPAPI_API_KEY`) with retry + TTL caching; respect those env contracts when wiring new providers.

## UI & State Conventions
- Appearance and global theming live in [src/contexts/AppearanceContext.jsx](src/contexts/AppearanceContext.jsx); it writes CSS vars on `document.documentElement`, so prefer consuming those vars instead of hard-coded colors.
- Authentication/onboarding is mocked locally in [src/features/auth/AuthGate.jsx](src/features/auth/AuthGate.jsx) using `localStorage`; any new auth UX should honor the storage keys defined there.
- Localization is mandatory: initialize strings through `useTranslation` and ensure resources land in the language bundles wired in [src/i18n/index.js](src/i18n/index.js); run `npm run i18n:extract` + `npm run i18n:verify` before shipping copy-heavy work.
- Calendar sync features rely on [src/hooks/useGoogleCalendarIntegration.js](src/hooks/useGoogleCalendarIntegration.js); they dynamically load GIS and require `VITE_GOOGLE_CLIENT_ID` to be present, so guard new calls behind `isSupported`/`isReady`.

## Workflows & Tooling
- Core scripts (see [package.json](package.json)): `npm run dev` (Vite), `npm run electron-dev` (Vite + Electron), `npm run build`, `npm run dist:win|mac|linux`, `npm run preview`, `npm run test` (Vitest), `npm run lint`, `npm run typecheck`.
- Windows installer builds are wrapped in [scripts/build-win.js](scripts/build-win.js); it wipes `dist/`, stamps a build-version suffix, runs `npm run build`, then invokes `electron-builder --win nsis`.
- Production builds honor `PUBLIC_URL` via [vite.config.mts](vite.config.mts), so set that env when targeting GitHub Pages or Capacitor; assets output into `build/` for both the web deploy and Electron packaging.
- The `buildResources/` + `public/app-icons/` directories are shared between Electron and installers—update icons in both to avoid mismatched branding.

## Testing & Quality Gates
- Vitest suites in [tests/genetics.test.ts](tests/genetics.test.ts), [tests/goals.test.ts](tests/goals.test.ts), and [tests/score.test.ts](tests/score.test.ts) lock down math-heavy behavior; add new cases alongside any genetics/ranking changes.
- Run `npm run lint` and `npm run typecheck` because the project mixes JS + TS; TypeScript files under `src/` and `tests/` expect `tsconfig` defaults even when imported from JSX.
- i18n coverage is enforced by [scripts/check-locales.cjs](scripts/check-locales.cjs); missing keys fail `npm run i18n:verify`, so add English strings first, then copy to other locales (even if untranslated placeholders).
- When touching cache/search/demand code, test both browser (memory cache) and Node/Electron cases so optional dependencies like `better-sqlite3`, `jsdom`, and `@mozilla/readability` are handled gracefully.

## Desktop & Native Notes
- Desktop data is saved per-user via `app.getPath('userData')` in [electron/main.js](electron/main.js); never write arbitrary locations from the renderer—use `window.electronAPI.saveData`.
- The Electron i18n loader in [electron/i18n.js](electron/i18n.js) copies `src/locales/**/electron.json` plus `src/i18n/settings.json` into packaged assets through the `extraResources` block in [package.json](package.json); keep these paths intact when reorganizing locales.
- Capacitor is configured in [capacitor.config.ts](capacitor.config.ts) to point at `build/`; any mobile packaging must run `npm run build` before `npx cap sync`.
