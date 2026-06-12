# Frontend Cookie Preferred Auth Plan

## Goal
Move breeder, lab, admin, marketplace, shared, and root frontend API clients toward httpOnly cookie authentication while preserving Bearer token fallback until the migration is complete.

## Implemented Direction
- Include `credentials: "include"` on shared backend requests.
- Track `cookie-preferred` auth mode per app scope in local storage.
- Store CSRF tokens per scope when the backend returns or issues them.
- Prefer cookie auth when `cookie-preferred` is active.
- Retry with Bearer once when a cookie-preferred authenticated request receives `401` and a stored Bearer token exists.
- Keep current token/refresh localStorage support for deterministic E2E and rollback.

## Remaining Work
- Remove localStorage token persistence only after all app flows pass cookie-mode E2E.
- Add a real refresh-session table before enforcing session device management.
- Run browser E2E against live backend/frontend servers before staging.

