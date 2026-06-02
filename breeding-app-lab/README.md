# breeding-app-lab

Prepared lab/genetic testing app split from the combined Breeding Planner repository.

## Contains

- Lab app entry at `src/AppEntry.jsx`.
- Lab pages, components, hooks, API handlers, utilities, services, PDF helpers, and lab DTOs.
- Shared auth, backend status, appearance, and API client dependencies copied from the current app.

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

- Move pure lab DTO/status/pricing/label logic to `breeding-app-shared`.
- Keep order mutation and result finalization authority in `breeding-app-backend`.
- Normalize current role naming differences before production use.

