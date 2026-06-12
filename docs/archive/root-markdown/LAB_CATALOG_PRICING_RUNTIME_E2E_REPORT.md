# Lab Catalog Pricing Runtime E2E Report

Date: 2026-05-17

## Result

Passed at backend/runtime API level and verified through the lab app API client path.

The catalog and pricing APIs were verified against the approved local PostgreSQL database using a seeded authenticated breeder user. The lab frontend was also built and served locally against the same backend configuration.

## API Checks

| Endpoint | Result |
| --- | --- |
| `GET /api/lab/tests/catalog?breederView=true` | Passed |
| `GET /api/lab/tests/pricing` | Passed |

## Data Checks

| Data | Result |
| --- | --- |
| Catalog source | Local PostgreSQL through backend API |
| Catalog count | 44 |
| Pricing source | Local PostgreSQL through backend API |
| Pricing config | Present |
| Local fallback used | No backend fallback observed |

## Frontend Checks

| Check | Result |
| --- | --- |
| Lab frontend served locally | Passed on `http://localhost:5174/` |
| Lab frontend build | Passed |
| Lab frontend tests | Passed, 56 tests |
| API client catalog path | Uses shared backend request |
| API client pricing path | Uses shared backend request |

## Remaining UI Check

The browser/frontend E2E check still needs to confirm the lab or breeder UI calls these backend endpoints and renders the catalog/pricing data correctly.

No browser E2E runner is currently configured, so this was not automated in this stage.

