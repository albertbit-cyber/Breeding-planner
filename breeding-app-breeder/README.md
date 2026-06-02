# breeding-app-breeder

Prepared breeder-facing app split from the combined Breeding Planner repository.

## Contains

- Breeder planner entry at `src/AppEntry.jsx`.
- Animal, pairing, clutch, incubator, label, QR, spaces, calendar, and breeder settings source copied from the current app.
- Breeder-side lab order dependencies.
- Desktop/mobile packaging folders copied for later cleanup because those shells currently belong closest to the breeder app.

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

- Replace temporary copied shared modules with imports from `breeding-app-shared`.
- Remove unrelated marketplace/admin/lab code once breeder-only routes are fully separated.
- Re-check Electron, Android, and iOS packaging after dependency installation.

