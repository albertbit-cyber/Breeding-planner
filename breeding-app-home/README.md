# breeding-app-home

Public landing page and sign-up front door for Breeding Planner. Structured like
the sibling portals (`breeding-app-lab`, `breeding-app-admin`,
`breeding-app-marketplace`); the page content was moved here from the retired
`breeding-app-public`.

## Contains

- App entry at `src/AppEntry.jsx`, router at `src/home/HomeApp.jsx`.
- `src/home/pages/` — home, pricing, register, login, privacy, terms, impressum.
- `src/home/components/` — navbar, footer, logo, legal layout.
- `src/home/lib/api.js` — the small public endpoint client (register, login, public tiers).
- `src/home/home.css` — the landing page visual language.
- Shared i18n, backend status, appearance, and API client modules copied from the sibling apps.

## Routing

Every route is served by the SPA, so any host must fall back to `index.html`
(`netlify.toml` already does this). Unlike the sibling apps the build `base` is
absolute rather than `./`, because a deep URL such as `/pricing` still has to
resolve assets from the site root.

## Backend

Set `VITE_API_URL` to the shared backend API base URL. `VITE_BREEDER_APP_URL`,
`VITE_LAB_APP_URL`, `VITE_ADMIN_APP_URL` and `VITE_MARKETPLACE_APP_URL` point the
footer and the post-login redirect at the sibling apps. See `.env.example`.

## Commands

```bash
npm install
npm run dev      # http://localhost:5178
npm run build
npm test
```

## Known Cleanup

- The pages are English-only hardcoded strings; i18n is wired up but not yet applied to them.
- `src/home/lib/api.js` duplicates `src/shared/apiClient.ts` — collapse onto the shared client.
- Replace copied shared modules with imports from `breeding-app-shared`.
