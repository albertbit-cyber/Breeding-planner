# Minimal Playwright Setup Plan

Date: 2026-05-17

## Goal

Add the smallest useful Playwright setup that proves the local backend, local PostgreSQL database, seeded lab login, and core Lab app screens work together.

## Planned Coverage

- Backend health endpoint is reachable.
- Lab frontend loads without browser console errors.
- Seeded lab user can log in through the browser.
- Catalog and pricing screens call backend APIs.
- Lab order list loads the seeded backend order `05AA00001`.

## Runner Design

- Keep Playwright inside `breeding-app-lab`.
- Start/reuse the backend from `../breeding-app-backend`.
- Start/reuse the Lab frontend at `http://127.0.0.1:4173`.
- Use one worker to avoid login rate-limit noise against the local backend.
- Use a setup project to create ignored authenticated storage state for normal browser tests.
- Keep one explicit UI-login test with empty storage state to prove seeded login still works.

## Non-Goals

- No staging deployment.
- No production credentials.
- No removal of remaining local fallback stores yet.
- No broad frontend API migration beyond the screens covered by these tests.
