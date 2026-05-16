# breeding-app-admin

Prepared admin app split from the combined Breeding Planner repository.

## Contains

- Admin app entry at `src/AppEntry.jsx`.
- `src/admin/AdminApp.jsx`.
- Shared auth, backend status, appearance, and API client dependencies copied from the current app.
- Temporary marketplace page copy for current admin marketplace moderation behavior.

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

- Replace the temporary marketplace page reuse with admin-owned moderation screens.
- Replace copied shared modules with imports from `breeding-app-shared`.
- Confirm moderator/support permissions after the auth model is normalized.

