# Backend Real Database Runtime Report

Date: 2026-05-17

## Result

Passed.

The backend was started against the approved local PostgreSQL database and verified with health, login, catalog, and pricing requests.

## Runtime Target

| Field | Value |
| --- | --- |
| Backend | `breeding-app-backend` |
| Database | Local PostgreSQL |
| Host | localhost |
| Port | 4000 |
| Secrets printed | No |

## Commands Used

Build:

```powershell
npm.cmd run build
```

Runtime verification used the compiled backend:

```powershell
node dist/server.js
```

## Endpoint Checks

| Check | Result |
| --- | --- |
| `GET /api/health` | Passed |
| `POST /api/auth/login` with seeded breeder user | Passed |
| `GET /api/lab/tests/catalog?breederView=true` | Passed |
| `GET /api/lab/tests/pricing` | Passed |

## Runtime Data Results

| Data | Result |
| --- | --- |
| Login token created | Yes, value not printed |
| Normalized role | `breeder` |
| Catalog count | 44 |
| Pricing config | Present |

## Notes

The first background launch attempts were unreliable because wrapper processes exited or a stale process occupied port 4000. A clean controlled backend run verified the runtime successfully.

