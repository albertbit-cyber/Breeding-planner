# breeding-app-marketplace

Prepared marketplace app split from the combined Breeding Planner repository.

## Contains

- Marketplace app entry at `src/AppEntry.jsx`.
- Marketplace page, subscription pricing page, public marketplace assets, auth, shared backend status, appearance, and API client dependencies.

## Backend

Set `VITE_API_URL` to the shared backend API base URL.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```

## Known Cleanup

- Remove admin moderation code from the marketplace app.
- Split seller dashboard, public browsing, inquiry, saved search, messaging, favorites, and profile views into dedicated pages.
- Replace copied shared modules with imports from `breeding-app-shared`.

