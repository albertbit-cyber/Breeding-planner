# Frontend Backend Runtime Connection Report

Date: 2026-05-17

## Result

Passed for local server reachability and API-backed client configuration.

The lab frontend is reachable locally and its shared API configuration points to the local backend API.

## Frontend

| Field | Value |
| --- | --- |
| App | `breeding-app-lab` |
| URL | `http://localhost:5174/` |
| API base | `http://127.0.0.1:4000/api` |
| Backend health | Passed |

## Checks

| Check | Result |
| --- | --- |
| Backend running on port 4000 | Passed |
| Lab frontend serving on port 5174 | Passed |
| Frontend page returns HTTP 200 | Passed |
| Lab app build | Passed |
| Lab app tests | Passed, 56 tests |
| Backend targeted tests | Passed, 24 tests |

## Browser E2E Gap

No Playwright/Cypress browser E2E runner is configured in the checked packages. Because of that, the browser console/network-tab inspection from step 83 was not fully automated. The backend API path itself was verified with real authenticated requests.

## Notes

Port 5173 was already in use, so the lab app was started on port 5174.

